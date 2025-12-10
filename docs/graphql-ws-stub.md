# GraphQL over WebSocket Stub Server

GraphQL over WebSocket + Subscriptions を試すための Node.js 製スタブサーバーです。  
`graphql-ws` と `graphql-subscriptions` を使い、WS エンドポイント `/graphql` で Query/Mutation/Subscription を受け付けます。

---

## 1. ディレクトリ構成（ルート直下）

```text
./
├─ package.json
└─ src/
    └─ index.js
```

---

## 2. `package.json`（pnpm 用）

```json
{
  "name": "graphql-ws-stub",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "@graphql-tools/schema": "^10.0.0",
    "graphql": "^16.9.0",
    "graphql-subscriptions": "^2.0.0",
    "graphql-ws": "^6.0.5",
    "ws": "^8.18.0"
  }
}
```

---

## 3. `src/index.js`

```js
import http from 'http';
import { WebSocketServer } from 'ws';
import { execute, subscribe } from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PubSub } from 'graphql-subscriptions';

// ============================
// GraphQL スキーマ定義
// ============================
const typeDefs = /* GraphQL */ `
  type Message {
    id: ID!
    text: String!
    createdAt: String!
    author: String!
    channel: String!
    important: Boolean!
    tags: [String!]!
  }

  type SystemStatus {
    online: Boolean!
    load: Float!
    updatedAt: String!
  }

  type Settings {
    theme: String!
    lang: String!
    updatedAt: String!
  }

  type Query {
    _noop: Boolean
  }

  type Mutation {
    sendMessage(
      text: String!
      author: String = "user"
      channel: String = "general"
      important: Boolean = false
      tags: [String!] = []
    ): Message!
  }

  type Subscription {
    messageAdded: Message!
    systemStatusChanged: SystemStatus!
    settingsUpdated: Settings!
  }
`;

const pubsub = new PubSub();
const MESSAGE_ADDED = 'MESSAGE_ADDED';
const SYSTEM_STATUS_CHANGED = 'SYSTEM_STATUS_CHANGED';
const SETTINGS_UPDATED = 'SETTINGS_UPDATED';

let idCounter = 1;

const resolvers = {
  Query: {
    _noop: () => true,
  },
  Mutation: {
    sendMessage: async (_, { text }) => {
      const message = {
        id: String(idCounter++),
        text,
        createdAt: new Date().toISOString(),
        author: 'user',
        channel: 'general',
        important: false,
        tags: [],
      };
      // Subscription に流す
      await pubsub.publish(MESSAGE_ADDED, { messageAdded: message });
      return message;
    },
  },
  Subscription: {
    messageAdded: {
      // GraphQL Subscriptions のエントリポイント
      subscribe: () => pubsub.asyncIterator(MESSAGE_ADDED),
    },
    systemStatusChanged: {
      subscribe: () => pubsub.asyncIterator(SYSTEM_STATUS_CHANGED),
    },
    settingsUpdated: {
      subscribe: () => pubsub.asyncIterator(SETTINGS_UPDATED),
    },
  },
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

// ============================
// HTTP + WebSocket サーバー起動
// ============================
const PORT = 4000;

// HTTP サーバー（簡易のヘルスチェック用）
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('GraphQL WebSocket server is running');
});

// WebSocket サーバー
const wsServer = new WebSocketServer({
  server,
  path: '/graphql',
});

// graphql-ws 用サーバーを WebSocket 上で起動
useServer(
  {
    schema,
    execute,
    subscribe,
    onConnect: (ctx) => {
      console.log('Client connected');
    },
    onDisconnect(ctx, code, reason) {
      console.log('Client disconnected', code, reason.toString());
    },
  },
  wsServer,
);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint ws://localhost:${PORT}/graphql`);
});

// デモ用: 5秒ごとにダミーメッセージを自動送信
setInterval(async () => {
  const message = {
    id: String(idCounter++),
    text: `Server message #${idCounter}`,
    createdAt: new Date().toISOString(),
    author: 'server',
    channel: 'news',
    important: false,
    tags: ['auto'],
  };
  await pubsub.publish(MESSAGE_ADDED, { messageAdded: message });
}, 5000);

// デモ用: 7秒ごとにシステムステータス更新を流す
setInterval(async () => {
  const status = {
    online: true,
    load: Number((Math.random() * 1.5 + 0.1).toFixed(2)),
    updatedAt: new Date().toISOString(),
  };
  await pubsub.publish(SYSTEM_STATUS_CHANGED, { systemStatusChanged: status });
}, 7000);

// デモ用: 9秒ごとに設定値更新を流す
setInterval(async () => {
  const settings = {
    theme: Math.random() > 0.5 ? 'dark' : 'light',
    lang: Math.random() > 0.5 ? 'ja' : 'en',
    updatedAt: new Date().toISOString(),
  };
  await pubsub.publish(SETTINGS_UPDATED, { settingsUpdated: settings });
}, 9000);
```

---

## 4. フロントエンド向け API 早見表

- エンドポイント: `ws://localhost:4000/graphql`（Query/Mutation/Subscription すべて同一）
- Mutation:
  - `sendMessage(text: String!, author: String = "user", channel: String = "general", important: Boolean = false, tags: [String!] = [])`
- Subscription:
  - `messageAdded: Message!`（チャットメッセージ）
  - `systemStatusChanged: SystemStatus!`（システムステータス）
  - `settingsUpdated: Settings!`（設定値）
- 型:
  - `Message { id, text, createdAt, author, channel, important, tags }`
  - `SystemStatus { online, load, updatedAt }`
  - `Settings { theme, lang, updatedAt }`

### サンプル Subscription（必要なフィールドだけ選択可）

```graphql
subscription DemoMessages {
  messageAdded {
    id
    text
    author
    channel
  }
}

subscription DemoStatus {
  systemStatusChanged {
    online
    load
  }
}

subscription DemoSettings {
  settingsUpdated {
    theme
    lang
  }
}
```

### サンプル Mutation

```graphql
mutation SendMessageSample {
  sendMessage(
    text: "hello"
    author: "alice"
    channel: "general"
    important: true
    tags: ["demo", "client"]
  ) {
    id
    text
    author
    tags
  }
}
```

---

## 5. セットアップ & 起動（pnpm）

`packageManager` に合わせて pnpm のバージョンを固定してから依存を入れます。

```bash
corepack use pnpm@10.25.0
pnpm install --frozen-lockfile
pnpm start
# => http://localhost:4000 / ws://localhost:4000/graphql で起動
```

起動後は自動で以下が流れます:
- 5 秒ごと: `messageAdded`（ダミーメッセージ）
- 7 秒ごと: `systemStatusChanged`（システムステータス）
- 9 秒ごと: `settingsUpdated`（設定値）

クライアントから `sendMessage` Mutation を送ると `messageAdded` に即時反映されます。
