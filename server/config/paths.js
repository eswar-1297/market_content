/**
 * Centralized data-directory resolution.
 *
 * All persistent server state (SQLite DBs, learned feedback rules, bookmarks,
 * caches) lives under a single directory so self-hosted deployments can point it
 * at a durable volume OUTSIDE the deploy directory (so re-cloning / redeploying
 * never wipes writer history or personalization).
 *
 * Set DATA_DIR to override the location, e.g. on a server:
 *   DATA_DIR=/var/lib/cloudfuze-content
 * Relative paths are resolved from the process working directory. If unset, it
 * defaults to server/data (the original location — existing setups keep working).
 */

import { dirname, join, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, '..', 'data');

export const DATA_DIR = process.env.DATA_DIR
  ? (isAbsolute(process.env.DATA_DIR) ? process.env.DATA_DIR : join(process.cwd(), process.env.DATA_DIR))
  : DEFAULT_DATA_DIR;

// Ensure the directory exists before anything tries to open a file inside it.
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

/** Build an absolute path to a file inside the data directory. */
export function dataPath(...segments) {
  return join(DATA_DIR, ...segments);
}
