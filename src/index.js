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
