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
      "profileImage": "https://s3-url...",
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
        "profileImage": "https://s3-url...",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      },
      {
        "id": "uuid-string",
        "walletAddress": "0x124...",
        "isNewUser": true,
        "totalPoints": 0,
        "hasMintedCard": false,
        "profileImage": "",
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
      "profileImage": "https://s3-url...",
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
      "profileImage": "https://s3-url...",
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
      "profileImage": "https://s3-url...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "error": null
  }
  ```

---

## 2. Basecard Management

### Create Basecard Data

generate the card data for minting ERC721 NFT in backend side and save it to the database.

- **URL**: `/basecards`
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
      "social_values": ["@jeonogseup"]
    },
    "error": null
  }
  ```

### Get All Basecards

Retrieves a list of all minted cards.

- **URL**: `/basecards`
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

### Update Basecard

Updates an existing card's information.

- **URL**: `/basecards/:id`
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

- **URL**: `/basecards/basecard/:address`
- **Method**: `PUT`
- **Request Body**:
  ```json
  {
    "tokenId": 1
  }
  ```
- **Response**: Updated Card object

### Delete Basecard

Deletes a user's card data.

- **URL**: `/basecards/basecard/:address`
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

## 3. Collection Management

### Create Collection

Collects a card for a user.

- **URL**: `/collections`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "collectorUserId": "uuid-string",
    "collectedCardId": "uuid-string"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "result": {
      "id": "uuid-string",
      "collectorUserId": "uuid-string",
      "collectedCardId": "uuid-string",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "error": null
  }
  ```

### Get All Collections

Retrieves a list of all collections.

- **URL**: `/collections`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "success": true,
    "result": [
      {
        "id": "uuid-string",
        "collectorUserId": "uuid-string",
        "collectedCardId": "uuid-string",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "collector": { ... },
        "collectedCard": { ... }
      }
    ],
    "error": null
  }
  ```

### Get Collection by ID

Retrieves a specific collection by ID.

- **URL**: `/collections/:id`
- **Method**: `GET`
- **Response**: Collection object

### Delete Collection

Deletes a collection.

- **URL**: `/collections/:id`
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

---

## 6. Events

### Receive Contract Event

Receives a contract event from an indexer or webhook.

- **URL**: `/events`
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "transactionHash": "0x...",
    "blockNumber": 123456,
    "blockHash": "0x...",
    "logIndex": 0,
    "eventName": "MintBaseCard",
    "args": {
      "user": "0x...",
      "tokenId": 1
    }
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "eventId": "uuid-string"
  }
  ```

### Get All Events

Retrieves a list of all contract events.

- **URL**: `/events`
- **Method**: `GET`
- **Response**:

  ```json
  [
    {
      "id": "uuid-string",
      "transactionHash": "0x...",
      "blockNumber": 123456,
      "blockHash": "0x...",
      "logIndex": 0,
      "eventName": "MintBaseCard",
      "args": { ... },
      "processed": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
  ```

## Quests

### Create Quest

- **URL**: `/v1/quests`
- **Method**: `POST`
- **Description**: Create a new quest.
- **Request Body**:
  ```json
  {
    "title": "Quest Title",
    "description": "Quest Description",
    "rewardAmount": 100,
    "actionType": "MINT"
  }
  ```
- **Response**:
  - **201 Created**: Returns the created quest.

### Get All Quests

- **URL**: `/v1/quests`
- **Method**: `GET`
- **Description**: Retrieve all quests.
- **Response**:
  - **200 OK**: Returns a list of quests.

### Get Quest by ID

- **URL**: `/v1/quests/:id`
- **Method**: `GET`
- **Description**: Retrieve a specific quest by ID.
- **Response**:
  - **200 OK**: Returns the quest object.

### Update Quest

- **URL**: `/v1/quests/:id`
- **Method**: `PATCH`
- **Description**: Update a quest.
- **Request Body**:
  ```json
  {
    "title": "Updated Title",
    "rewardAmount": 150
  }
  ```
- **Response**:
  - **200 OK**: Returns the updated quest.

### Delete Quest

- **URL**: `/v1/quests/:id`
- **Method**: `DELETE`
- **Description**: Delete a quest.
- **Response**:
  - **200 OK**: Returns the deletion result.
