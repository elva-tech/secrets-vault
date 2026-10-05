import { BackgroundJobModel, JobStatus } from '../models/background-job.model.js';
import { JobDedupModel } from '../models/job-dedup.model.js';

export class JobQueueService {
  async enqueue(type: string, dedupKey: string, payload: Record<string, unknown>, runAt: Date): Promise<boolean> {
    try {
      await JobDedupModel.create({ dedupKey, jobType: type });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
    try {
      await BackgroundJobModel.create({
        type,
        dedupKey,
        payload,
        runAt,
        status: JobStatus.PENDING,
      });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return false;
      throw err;
    }
  }

  async claimNext(): Promise<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    dedupKey: string;
  } | null> {
    const now = new Date();
    const job = await BackgroundJobModel.findOneAndUpdate(
      { status: JobStatus.PENDING, runAt: { $lte: now } },
      { status: JobStatus.PROCESSING, $inc: { attempts: 1 } },
      { sort: { runAt: 1 }, new: true },
    ).exec();
    if (!job) return null;
    return {
      id: job._id.toString(),
      type: job.type,
      payload: job.payload as Record<string, unknown>,
      dedupKey: job.dedupKey,
    };
  }

  async complete(jobId: string): Promise<void> {
    await BackgroundJobModel.updateOne(
      { _id: jobId },
      { status: JobStatus.COMPLETED, completedAt: new Date() },
    );
  }

  async fail(jobId: string, message: string): Promise<void> {
    await BackgroundJobModel.updateOne(
      { _id: jobId },
      { status: JobStatus.FAILED, lastError: message },
    );
  }
}
