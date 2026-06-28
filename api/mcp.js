// Vercel serverless entry for the Workflow Canvas MCP server.
// Endpoint: POST /api/mcp  (Streamable HTTP transport, JSON responses)
// All logic lives in ../mcp/ so the app's src/ stays untouched.
export { default } from '../mcp/server.js'
