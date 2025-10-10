# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for native modules (canvas)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies for canvas
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create cache directory
RUN mkdir -p /app/cache && chown -R node:node /app

# Use non-root user
USER node

# Expose application port
EXPOSE 3000

# Start the application
CMD ["node", "dist/server.js"]
