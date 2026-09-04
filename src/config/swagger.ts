import swaggerJSDoc from "swagger-jsdoc";
import path from "path";

const isCompiled = __filename.endsWith(".js");

const swaggerDefinition: swaggerJSDoc.OAS3Definition = {
  openapi: "3.0.3",
  info: {
    title: "LaunchPad Backend API",
    version: "1.0.0",
    description:
      "API documentation for the LaunchPad backend. Use the Authorize button with a bearer access token to try protected routes.",
  },
  servers: [{ url: "/api", description: "Current server" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: { type: "object", nullable: true },
        },
      },
      ApiError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "That email or password didn't match. Please try again." },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "UNAUTHORIZED" },
              details: { type: "object", nullable: true },
            },
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", example: "Ada Lovelace" },
          email: { type: "string", format: "email" },
          dateOfBirth: { type: "string", format: "date", nullable: true },
          status: { type: "string", enum: ["pending", "active", "suspended"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Session: {
        type: "object",
        properties: {
          accessToken: { type: "string", description: "Short-lived JWT. Send as `Authorization: Bearer <token>`." },
          user: { $ref: "#/components/schemas/User" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

const apisGlob = path
  .join(__dirname, isCompiled ? "../modules/**/*.routes.js" : "../modules/**/*.routes.ts")
  .split(path.sep)
  .join("/");

export const swaggerSpec = swaggerJSDoc({ swaggerDefinition, apis: [apisGlob] });
