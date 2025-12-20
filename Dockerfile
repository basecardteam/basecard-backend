# Base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Install curl for healthcheck + fonts for image rendering
RUN apk add --no-cache \
    curl \
    unzip \
    fontconfig \
    freetype \
    && mkdir -p /usr/share/fonts/k2d

# Copy and install K2D font from local zip file
COPY K2D.zip /tmp/K2D.zip
RUN unzip -j /tmp/K2D.zip "*.ttf" -d /usr/share/fonts/k2d \
    && rm /tmp/K2D.zip \
    && fc-cache -fv

# Copy built assets and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "run", "start:prod"]
