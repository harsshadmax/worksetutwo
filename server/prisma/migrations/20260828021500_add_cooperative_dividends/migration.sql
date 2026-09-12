-- AlterEnum
ALTER TYPE "CreditTransactionType" ADD VALUE 'DIVIDEND_PAYOUT';

-- AlterTable
ALTER TABLE "cooperatives" ADD COLUMN     "dividendSharePercent" INTEGER NOT NULL DEFAULT 10;
