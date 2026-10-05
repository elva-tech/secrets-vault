import mongoose, { Schema, type InferSchemaType } from 'mongoose';

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

const backgroundJobSchema = new Schema(
  {
    type: { type: String, required: true, index: true },
    dedupKey: { type: String, required: true, unique: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: Object.values(JobStatus), default: JobStatus.PENDING, index: true },
    runAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type BackgroundJobDocument = InferSchemaType<typeof backgroundJobSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const BackgroundJobModel = mongoose.model('BackgroundJob', backgroundJobSchema);
