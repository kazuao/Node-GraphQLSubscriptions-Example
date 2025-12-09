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
import { useServer } from 'graphql-ws/lib/use/ws';
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
  }

  type Query {
    _noop: Boolean
  }

  type Mutation {
    sendMessage(text: String!): Message!
  }

  type Subscription {
    messageAdded: Message!
  }
`;

const pubsub = new PubSub();
const MESSAGE_ADDED = 'MESSAGE_ADDED';

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
  };
  await pubsub.publish(MESSAGE_ADDED, { messageAdded: message });
}, 5000);
```

---

## 4. セットアップ & 起動（pnpm）

```bash
pnpm install
pnpm start
# => http://localhost:4000 / ws://localhost:4000/graphql で起動
```

起動後は 5 秒ごとにサーバー側からダミーメッセージが `messageAdded` Subscription で流れます。クライアントから `sendMessage` Mutation を送ると同じ Subscription に反映されます。
