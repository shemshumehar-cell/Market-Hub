# MarketHub Production Containerfile
# Base Image: Official Node.js 24 Alpine Linux
FROM node:24-alpine

# Security Best Practice: Set NODE_ENV to production
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/markethub.db

# Set isolated working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy application source and assets
COPY src/ ./src/

# Create persistent database and uploads directories with permissions for non-root user
RUN mkdir -p /app/data /app/src/public/uploads && chown -R node:node /app

# Security: Run application as unprivileged 'node' user (least privilege principle)
USER node

# Expose HTTP port
EXPOSE 3000

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start MarketHub server
CMD ["node", "src/server.js"]
