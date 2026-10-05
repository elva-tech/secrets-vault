import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const jobDedupSchema = new Schema(
  {
    dedupKey: { type: String, required: true, unique: true, index: true },
    jobType: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export type JobDedupDocument = InferSchemaType<typeof jobDedupSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const JobDedupModel = mongoose.model('JobDedup', jobDedupSchema);
