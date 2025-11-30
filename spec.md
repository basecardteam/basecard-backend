# [BaseCard] Backend specs

:::info
:bulb: This document outlines the API endpoints implemented in the BaseCard backend.
All endpoints are prefixed with `/v1`.
:::

## :beginner: Product Info

- Product Name: BaseCard
- Implementation Status:
  - [x] users
  - [x] cards
  - [ ] collections
  - [ ] point_logs
  - [ ] quests

## Response Format

All API responses follow this standard format:

```json
{
  "success": true, // or false
  "result": { ... }, // Data payload (null if error)
  "error": null // Error message string (null if success)
}
```

All examples below show the `result` payload or the full structure where appropriate.

---

## 1. User Management

### Get or Create User

Retrieves an existing user by wallet address or creates a new one if not found.

- **URL**: `/users`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "walletAddress": "0x123..."
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "result": {
      "id": "uuid-string",
      "walletAddress": "0x123...",
      "isNewUser": true,
      "totalPoints": 0,
      "hasMintedCard": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "error": null
  }
  ```

### Get All Users

Retrieves a list of all users.

- **URL**: `/users`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "success": true,
    "result": [
      {
        "id": "uuid-string",
        "walletAddress": "0x123...",
        "isNewUser": true,
        "totalPoints": 0,
        "hasMintedCard": false,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      },
      {
        "id": "uuid-string",
        "walletAddress": "0x124...",
        "isNewUser": true,
        "totalPoints": 0,
        "hasMintedCard": false,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "error": null
  }
  ```

### Update User's 'isNewUser'

Updates the `isNewUser` status of a user.

- **URL**: `/users/:address`
- **Method**: `PATCH`
- **Request Body**:

  ```json
  {
    "isNewUser": false
  }
  ```

- **Response**:
  ```json
  {
    "success": true,
    "result": {
      "id": "uuid-string",
      "walletAddress": "0x123...",
      "isNewUser": true,
      "totalPoints": 0,
      "hasMintedCard": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "error": null
  }
  ```

### Update User's 'hasMintedCard'

Updates the `hasMintedCard` status of a user.

- **URL**: `/users/:address`
- **Method**: `PATCH`
- **Request Body**:

  ```json
  {
    "hasMintedCard": true
  }
  ```

- **Response**:
  ```json
  {
    "success": true,
    "result": {
      "id": "uuid-string",
      "walletAddress": "0x123...",
      "isNewUser": true,
      "totalPoints": 0,
      "hasMintedCard": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "error": null
  }
  ```

### Increase User's 'totalPoints'

Increases the user's total points by the specified amount.

- **URL**: `/users/:address/points`
- **Method**: `PATCH`
- **Request Body**:
  ```json
  {
    "points": 100
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "result": {
      "id": "uuid-string",
      "walletAddress": "0x123...",
      "isNewUser": true,
      "totalPoints": 100,
      "hasMintedCard": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "error": null
  }
  ```

---

## 2. Card Management

### Create Card Data

generate the card data for minting ERC721 NFT in backend side and save it to the database.

- **URL**: `/cards`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "nickname": "User's Nickname",
    "role": "Developer",
    "bio": "Hello, World",
    "address": "0x123...",
    "profileImage": "formdata image",
    "socials": { "twitter": "@jeongseup" }
  }
  ```
- **Response**:
  ```json
    {
      "success": true, // or false
      "result": {
        "card_data": {
            "nickname": "User's Nickname",
            "role": "Developer",
            "bio": "Hello, World",
            "imageUri": "ipfs://..."
        },
        "social_keys": ["twitter"],
        "social_values" ["@jeonogseup"]
        },
      "error": null
    }
  ```

### Get All Cards

Retrieves a list of all minted cards.

- **URL**: `/cards`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "success": true,
    "result": [
      {
        "id": "uuid-string",
        "nickname": "User",
        "role": "Developer",
        "bio": "Hello, World",
        "address": "0x123...",
        "profileImage": "https://s3-url...",
        "socials": { "twitter": "@jeongseup" },
        "skills": ["React", "Solidity"],
        "tokenId": 1,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "error": null
  }
  ```

### Update Card

Updates an existing card's information.

- **URL**: `/cards/:id`
- **Method**: `PATCH`
- **Request Body**:
  ```json
  {
    "nickname": "Updated Nickname",
    "bio": "Updated Bio"
  }
  ```
- **Response**: Updated Card object

### Update Token ID

Updates the minted Token ID for a user's card.

- **URL**: `/cards/card/:address`
- **Method**: `PUT`
- **Request Body**:
  ```json
  {
    "tokenId": 1
  }
  ```
- **Response**: Updated Card object

### Delete Card

Deletes a user's card data.

- **URL**: `/cards/card/:address`
- **Method**: `DELETE`
- **Response**:
  ```json
  {
    "success": true,
    "result": { "success": true },
    "error": null
  }
  ```

---

## 3. Collections

### Get User Collections

Retrieves the list of cards collected by a specific user.

- **URL**: `/collections/:userId`
- **Method**: `GET`
- **Response**: List of collected cards

### Add to Collection

Adds a card to the user's collection.

- **URL**: `/collections`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "collectorUserId": "uuid-string",
    "collectedCardId": "uuid-string"
  }
  ```
- **Response**: Created Collection object

---

## 4. Point Logs

### Get User Point Logs

Retrieves the point history for a specific user.

- **URL**: `/point-logs/:userId`
- **Method**: `GET`
- **Response**: List of point transactions

---

## 5. Quests

### Get All Quests

Retrieves the list of available quests.

- **URL**: `/quests`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "success": true,
    "result": [
      {
        "id": "uuid-string",
        "title": "Mint your BaseCard",
        "description": "Mint your first onchain ID card",
        "reward": 1000,
        "actionType": "MINT"
      },
      {
        "id": "uuid-string",
        "title": "Share on Farcaster / BaseApp",
        "description": "Share your BaseCard on Farcaster / BaseApp",
        "reward": 500,
        "actionType": "SHARE"
      },
      {
        "id": "uuid-string",
        "title": "Notification ON",
        "description": "Add BaseCard miniapp & enable notification",
        "reward": 500,
        "actionType": "NOTIFICATION"
      },
      {
        "id": "uuid-string",
        "title": "Follow @basecardteam",
        "description": "Follow the official basecard account",
        "reward": 500,
        "actionType": "FOLLOW"
      },
      {
        "id": "uuid-string",
        "title": "Link socials",
        "description": "Link your social account",
        "reward": 500,
        "actionType": "LINK_SOCIAL"
      },
      {
        "id": "uuid-string",
        "title": "Link basename",
        "description": "Link your basename",
        "reward": 500,
        "actionType": "LINK_BASENAME"
      }
    ],
    "error": null
  }
  ```

### Verify Quest

Verifies if a user has completed a specific quest and awards points.

- **URL**: `/quests/verify`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "userId": "uuid-string",
    "questId": "uuid-string"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "result": {
      "verified": true,
      "rewarded": 500,
      "newTotalPoints": 1500
    },
    "error": null
  }
  ```
