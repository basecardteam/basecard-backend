# Base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

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
    ttf-dejavu \
    && mkdir -p /usr/share/fonts/noto \
    && curl -L -o /tmp/NotoSansCJK.ttc.zip https://github.com/googlefonts/noto-cjk/releases/download/Sans2.004/03_NotoSansCJK-OTC.zip \
    && unzip -j /tmp/NotoSansCJK.ttc.zip "*.ttc" -d /usr/share/fonts/noto \
    && rm /tmp/NotoSansCJK.ttc.zip \
    && fc-cache -fv

# Copy built assets and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "run", "start:prod"]
