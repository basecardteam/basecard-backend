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

// --------------------------------------------------------------------------
// 1. Users (Account)
// --------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(), // UUID
  walletAddress: varchar('wallet_address', { length: 42 }).unique().notNull(),

  totalPoints: integer('total_points').default(0).notNull(),

  isNewUser: boolean('is_new_user').default(true),
  hasMintedCard: boolean('has_minted_card').default(false),
  profileImage: text('profile_image').default('').notNull(), // Supabase Storage URL

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --------------------------------------------------------------------------
// 2. Cards (Profile & NFT)
// --------------------------------------------------------------------------
export const cards = pgTable(
  'cards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull()
      .unique(),

    // Contract Metadata Mirroring
    tokenId: integer('token_id'),

    // basecard metadata
    nickname: varchar('nickname', { length: 256 }),
    role: text('role'),
    bio: text('bio'),
    imageUri: text('image_uri'), // NFT Metadata URI (IPFS)

    // basecard social data
    socials: jsonb('socials'), // { "twitter": "@handle", ... }

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('cards_user_id_idx').on(table.userId),
    index('cards_role_idx').on(table.role),
  ],
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
  referenceId: text('reference_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --------------------------------------------------------------------------
// 5. Quests
// --------------------------------------------------------------------------
export const quests = pgTable('quests', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  rewardAmount: integer('reward_amount').default(0).notNull(),
  actionType: varchar('action_type', { length: 50 }).unique().notNull(),
  isActive: boolean('is_active').default(true),
});

export const userQuestStatusEnum = pgEnum('quest_status', [
  'pending',
  'completed',
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
      .references(() => cards.id), // 수집된 카드
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
// Relations Definitions
// --------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  card: one(cards, {
    fields: [users.id],
    references: [cards.userId],
  }),
  pointLogs: many(pointLogs),
  completedQuests: many(userQuests),
  earnList: many(earn), // 내가 올린 공고들
  collections: many(collections), // 내가 수집한 카드들
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
  user: one(users, {
    fields: [cards.userId],
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
  collectedCard: one(cards, {
    fields: [collections.collectedCardId],
    references: [cards.id],
  }),
}));
