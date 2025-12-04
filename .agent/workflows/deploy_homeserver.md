---
description: Deploy BaseCard Backend to Home Server using Cloudflare Tunnel & Docker
---

# Home Server Deployment Guide

This guide explains how to deploy the BaseCard backend to a home server using Docker Compose and Cloudflare Tunnel. This setup eliminates the need for port forwarding and provides secure access management.

## Prerequisites

1.  **Home Server**: A machine with Docker and Docker Compose installed.
2.  **Cloudflare Account**: A domain managed by Cloudflare.
3.  **Project Files**: Ensure `Dockerfile` and `docker-compose.yml` are present in the project root.

## Step 1: Create Cloudflare Tunnel

1.  Log in to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2.  Go to **Networks** > **Tunnels**.
3.  Click **Create a tunnel**.
4.  Select **Cloudflared** connector.
5.  Name your tunnel (e.g., `basecard-home`).
6.  In the **Install and run a connector** step, choose **Docker**.
7.  Copy the token from the command (the long string after `--token`).
    - Example: `eyJhIjoi...`

## Step 2: Configure Server Environment

1.  Create a `.env` file in your server's project directory (copy from `.env.sample`).
2.  Add the `CLOUDFLARE_TUNNEL_TOKEN` variable at the end:

```bash
# ... existing variables ...

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN="paste_your_token_here"
```

3.  Ensure `DATABASE_URL` points to your database.
    - If using Supabase, use the transaction pooler URL.
    - If running a local DB, ensure the container can access it (or add a postgres service to `docker-compose.yml`).

## Step 3: Start Services

Run the following command in the project directory:

```bash
docker compose up -d
```

This will:

1.  Build the backend image (`basecard-backend`).
2.  Start the backend container on port 3000.
3.  Start the `cloudflared` container (`basecard-tunnel`) and establish a secure connection to Cloudflare.

## Step 4: Configure Public Hostname

1.  Go back to the **Cloudflare Tunnel** configuration page (where you copied the token).
2.  Click **Next**.
3.  In the **Public Hostnames** tab, click **Add a public hostname**.
4.  **Subdomain**: `api-prod` (or your desired subdomain).
5.  **Domain**: `example.com` (your domain).
6.  **Service**:
    - **Type**: `HTTP`
    - **URL**: `basecard-backend:3000` (Docker container name and port).
7.  Click **Save hostname**.

Now, your API is accessible at `https://api-prod.example.com`.

## Step 5: Secure Swagger UI (Zero Trust)

To prevent unauthorized access to the API documentation (`/api`):

1.  Go to **Cloudflare Zero Trust** > **Access** > **Applications**.
2.  Click **Add an application**.
3.  Select **Self-hosted**.
4.  **Application Configuration**:
    - **Application name**: `BaseCard Swagger`
    - **Session Duration**: `24h`
    - **Subdomain**: `api-prod`
    - **Domain**: `example.com`
    - **Path**: `api` (This matches `SwaggerModule.setup('api', ...)`).
5.  Click **Next**.
6.  **Add a Policy**:
    - **Policy Name**: `Allow Team`
    - **Action**: `Allow`
    - **Configure rules**:
      - **Include** > **Emails** > Enter your email address.
7.  Click **Next** > **Add application**.

## Verification

1.  **Public API**: Try accessing `https://api-prod.example.com/v1/users`. It should return a JSON response (or 404/401 depending on logic, but not a Cloudflare auth page).
2.  **Swagger UI**: Try accessing `https://api-prod.example.com/api`.
    - You should see the Cloudflare Access login screen.
    - Enter your email, get the code, and login.
    - You should then see the Swagger UI.

## Logging & Maintenance

- **View Logs**:
  ```bash
  docker compose logs -f
  ```

  - This streams logs from both the backend and the tunnel.
- **Update Application**:
  ```bash
  git pull
  docker compose build --no-cache
  docker compose up -d
  ```
