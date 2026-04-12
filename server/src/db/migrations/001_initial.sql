-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username     VARCHAR(32)  NOT NULL UNIQUE,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  total_wins   INT NOT NULL DEFAULT 0,
  total_games  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Game rooms
CREATE TYPE game_status AS ENUM ('waiting', 'playing', 'finished');

CREATE TABLE IF NOT EXISTS game_rooms (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status       game_status NOT NULL DEFAULT 'waiting',
  map_seed     INT NOT NULL,
  winner_id    UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);

-- Game players (one row per player per game)
CREATE TABLE IF NOT EXISTS game_players (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_room_id        UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id),
  position            INT NOT NULL DEFAULT 0,
  hp                  INT NOT NULL DEFAULT 100,
  max_hp              INT NOT NULL DEFAULT 100,
  attack              INT NOT NULL DEFAULT 10,
  defense             INT NOT NULL DEFAULT 5,
  gold                INT NOT NULL DEFAULT 500,
  is_alive            BOOLEAN NOT NULL DEFAULT TRUE,
  turn_order          INT NOT NULL,
  equipped_weapon_id  VARCHAR(64),
  UNIQUE(game_room_id, user_id),
  UNIQUE(game_room_id, turn_order)
);

-- Item inventory per player per game
CREATE TABLE IF NOT EXISTS player_inventory (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  item_id        VARCHAR(64) NOT NULL,
  quantity       INT NOT NULL DEFAULT 1,
  UNIQUE(game_player_id, item_id)
);

-- Bets placed during battles
CREATE TYPE bet_result AS ENUM ('won', 'lost', 'pending');
CREATE TYPE bet_target AS ENUM ('player_wins', 'monster_wins');

CREATE TABLE IF NOT EXISTS bets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_room_id     UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  battle_id        UUID NOT NULL,
  bettor_player_id UUID NOT NULL REFERENCES game_players(id),
  bet_on           bet_target NOT NULL,
  amount           INT NOT NULL,
  result           bet_result NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Game event log
CREATE TABLE IF NOT EXISTS game_log (
  id           BIGSERIAL PRIMARY KEY,
  game_room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  event_type   VARCHAR(32) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_players_room ON game_players(game_room_id);
CREATE INDEX IF NOT EXISTS idx_bets_battle ON bets(battle_id);
CREATE INDEX IF NOT EXISTS idx_game_log_room ON game_log(game_room_id);
