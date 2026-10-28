-- CreateEnum
CREATE TYPE "gender" AS ENUM ('FEMALE', 'MALE', 'UNSPECIFIED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" "gender" NOT NULL DEFAULT 'UNSPECIFIED';
