import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

const authServerUrl = process.env.NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL;
if (!authServerUrl) {
  throw new Error("NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL is not set");
}

const handler = protectedResourceHandler({
  // Specify the Issuer URL of the associated Authorization Server
  authServerUrls: [authServerUrl],
});

const metadataOptionsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, metadataOptionsHandler as OPTIONS };
