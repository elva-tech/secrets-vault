export enum VaultItemType {
  KEY_VALUE = 'KEY_VALUE',
  PASSWORD = 'PASSWORD',
  TEXT = 'TEXT',
  SECRET = 'SECRET',
  FILE = 'FILE',
  CERTIFICATE = 'CERTIFICATE',
  API_KEY = 'API_KEY',
  TOKEN = 'TOKEN',
}

export enum VaultItemStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

export enum VaultFileStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

/** Application vault vs isolated personal vault */
export enum VaultScope {
  APPLICATION = 'APPLICATION',
  PERSONAL = 'PERSONAL',
}
