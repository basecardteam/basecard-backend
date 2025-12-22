import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
  pgEnum,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

// Client type for user wallets
export const clientTypeEnum = pgEnum('client_type', [
  'farcaster',
  'baseapp',
  'metamask',
]);

// --------------------------------------------------------------------------
// 1. Users (Account) - with FID support
// --------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(), // UUID
  role: userRoleEnum('role').default('user').notNull(),
  walletAddress: varchar('wallet_address', { length: 42 }).unique().notNull(),
  fid: integer('fid').unique(), // Farcaster ID (nullable for wallet-only login)

  totalPoints: integer('total_points').default(0).notNull(),

  isNewUser: boolean('is_new_user').default(true),
  hasMintedCard: boolean('has_minted_card').default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --------------------------------------------------------------------------
// 1-1. User Wallets (client-specific wallet addresses)
// --------------------------------------------------------------------------
export const userWallets = pgTable(
  'user_wallets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    walletAddress: varchar('wallet_address', { length: 42 }).notNull(),
    clientType: clientTypeEnum('client_type').notNull(),
    clientFid: integer('client_fid'), // Farcaster: 9152, BaseApp: 309857
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_wallets_user_id_idx').on(table.userId),
    index('user_wallets_client_type_idx').on(table.clientType),
  ],
);

// --------------------------------------------------------------------------
// 2. Cards (Profile & NFT)
// --------------------------------------------------------------------------
export const basecards = pgTable(
  'basecards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull()
      .unique(),

    // Contract Metadata Mirroring
    tokenId: integer('token_id'),
    txHash: text('tx_hash'),

    // basecard metadata
    nickname: varchar('nickname', { length: 256 }),
    role: text('role'),
    bio: text('bio'),
    imageUri: text('image_uri'), // NFT Metadata URI (IPFS)
    socials: jsonb('socials'), // { "twitter": "@handle", ... }

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [index('basecards_user_id_idx').on(table.userId)],
);

// --------------------------------------------------------------------------
// 3. Earn (Previously Programs) - 구인/프로젝트/바운티
// --------------------------------------------------------------------------
// Enums 이름을 program_type -> earn_type으로 변경하여 일관성 유지
export const earnTypeEnum = pgEnum('earn_type', [
  'bounty',
  'project',
  'hiring',
]);

export const earn = pgTable('earn', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id), // 작성자

  title: text('title').notNull(),
  description: text('description'),
  type: earnTypeEnum('type').notNull(),

  // 상태 관리
  isOpen: boolean('is_open').default(true),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --------------------------------------------------------------------------
// 4. Point System
// --------------------------------------------------------------------------
export const pointLogTypeEnum = pgEnum('point_log_type', [
  'QUEST_REWARD',
  'MINT_BONUS',
  'REFERRAL',
  'ADMIN_ADJUST',
]);

export const pointLogs = pgTable('point_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id)
    .notNull(),
  amount: integer('amount').notNull(),
  type: pointLogTypeEnum('type').notNull(),
  questId: uuid('quest_id').references(() => quests.id),
  eventId: uuid('event_id').references(() => contractEvents.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --------------------------------------------------------------------------
// 5. Quests
// --------------------------------------------------------------------------
export const platformEnum = pgEnum('platform', [
  'FARCASTER',
  'X',
  'BASENAME',
  'APP',
  'GITHUB',
  'LINKEDIN',
  'WEBSITE',
]);

export const frequencyEnum = pgEnum('frequency', [
  'ONCE',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'ALWAYS',
]);

export const quests = pgTable('quests', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  rewardAmount: integer('reward_amount').default(0).notNull(),
  // New structure: platform + actionType
  platform: platformEnum('platform').notNull(),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  // Frequency for recurring quests
  frequency: frequencyEnum('frequency').default('ONCE').notNull(),
  cooldownSecond: integer('cooldown_second'), // null = no cooldown
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userQuestStatusEnum = pgEnum('quest_status', [
  'pending',
  'submitted', // User submitted proof (URL/screenshot), awaiting admin review
  'claimable',
  'completed',
  'rejected', // Admin rejected the submission
]);

export const userQuests = pgTable(
  'user_quests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    questId: uuid('quest_id')
      .references(() => quests.id)
      .notNull(),
    status: userQuestStatusEnum('status').default('pending'),
    // Metadata for user submissions (URL, screenshot link, etc.)
    // Example: { "url": "https://...", "note": "My screenshot" }
    metadata: jsonb('metadata'),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    uniqueUserQuest: unique('unique_user_quest').on(
      table.userId,
      table.questId,
    ),
  }),
);

// --------------------------------------------------------------------------
// 6. Collections (Networking)
// --------------------------------------------------------------------------
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectorUserId: uuid('collector_user_id')
      .notNull()
      .references(() => users.id), // 수집한 사람
    collectedCardId: uuid('collected_card_id')
      .notNull()
      .references(() => basecards.id), // 수집된 카드
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    uniqueCollection: unique('unique_collection').on(
      table.collectorUserId,
      table.collectedCardId,
    ),
  }),
);

// --------------------------------------------------------------------------
// 7. Contract Events (Indexer)
// --------------------------------------------------------------------------
export const contractEvents = pgTable(
  'contract_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    transactionHash: text('transaction_hash').notNull(),
    blockNumber: integer('block_number').notNull(),
    blockHash: text('block_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    eventName: text('event_name').notNull(),
    args: jsonb('args').notNull(), // { user: "0x...", tokenId: 1 }
    processed: boolean('processed').default(false),

    // TX Receipt Details
    fromAddress: text('from_address'), // tx sender
    toAddress: text('to_address'), // contract address
    gasUsed: text('gas_used'), // gas used (string for bigint)
    effectiveGasPrice: text('effective_gas_price'),
    txStatus: text('tx_status'), // 'success' or 'reverted'

    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    txHashIdx: index('contract_events_tx_hash_idx').on(table.transactionHash),
    blockHashIdx: index('contract_events_block_hash_idx').on(table.blockHash),
    eventNameIdx: index('contract_events_event_name_idx').on(table.eventName),
  }),
);

// --------------------------------------------------------------------------
// 8. Farcaster Notifications (for push notifications)
// --------------------------------------------------------------------------
export const farcasterNotifications = pgTable(
  'farcaster_notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    fid: integer('fid').notNull(), // Farcaster ID
    token: text('token').notNull(), // Notification token from Farcaster client
    url: text('url').notNull(), // URL to send notifications to
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userFidIdx: index('farcaster_notifications_user_fid_idx').on(
      table.userId,
      table.fid,
    ),
  }),
);

// --------------------------------------------------------------------------
// Relations Definitions
// --------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  card: one(basecards, {
    fields: [users.id],
    references: [basecards.userId],
  }),
  wallets: many(userWallets), // 1:N wallet addresses
  pointLogs: many(pointLogs),
  completedQuests: many(userQuests),
  earnList: many(earn), // 내가 올린 공고들
  collections: many(collections), // 내가 수집한 카드들
}));

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
}));

export const cardsRelations = relations(basecards, ({ one, many }) => ({
  user: one(users, {
    fields: [basecards.userId],
    references: [users.id],
  }),
  collectedBy: many(collections),
}));

export const earnRelations = relations(earn, ({ one }) => ({
  owner: one(users, {
    fields: [earn.ownerUserId],
    references: [users.id],
  }),
}));

export const userQuestsRelations = relations(userQuests, ({ one }) => ({
  user: one(users, { fields: [userQuests.userId], references: [users.id] }),
  quest: one(quests, {
    fields: [userQuests.questId],
    references: [quests.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one }) => ({
  collector: one(users, {
    fields: [collections.collectorUserId],
    references: [users.id],
  }),
  collectedCard: one(basecards, {
    fields: [collections.collectedCardId],
    references: [basecards.id],
  }),
}));
