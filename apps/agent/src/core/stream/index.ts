// Durable Streams - reliable streaming implementation
export {
  appendToStream,
  buildStreamPath,
  buildStreamUrl,
  clearStreamHandles,
  closeDurableStreams,
  deleteStream,
  getChatContext,
  getDurableStreamsBaseUrl,
  initDurableStreams,
  readFromStream,
  registerChatContext,
  stream,
  unregisterChatContext,
} from "./durable";

// Legacy Redis-based streaming (deprecated, kept for graceful shutdown only)
export { closeRedisConnections } from "./utils";
