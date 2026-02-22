const path = require("path");

type CommonObject = Record<string, string>;

export const SALT_DEFAULT_ROUNDS = 10;

export const LOG_LEVELS: CommonObject = {
  "0": "error",
  "1": "warn",
  "2": "info",
  "3": "debug",
  "4": "trace",
};

export const PATH_TO_LOG_FILE = "./logs/info.log";
export const PATH_TO_ERROR_LOG_FILE = "./logs/error.log";
export const PATH_TO_FILES = path.join(__dirname, "../upload");