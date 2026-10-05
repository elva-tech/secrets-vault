export enum RotationType {
  NO_EXPIRY = 'NO_EXPIRY',
  MONTHS_3 = 'MONTHS_3',
  MONTHS_6 = 'MONTHS_6',
  MONTHS_9 = 'MONTHS_9',
  MONTHS_12 = 'MONTHS_12',
  CUSTOM_DATE = 'CUSTOM_DATE',
}

export enum RotationMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC',
}

export enum RotationStatus {
  NONE = 'NONE',
  SCHEDULED = 'SCHEDULED',
  DUE = 'DUE',
  OVERDUE = 'OVERDUE',
  COMPLETED = 'COMPLETED',
}

export const ROTATION_REMINDER_OFFSETS_DAYS = [10, 5, 3, 2, 1] as const;
