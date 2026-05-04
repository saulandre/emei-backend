-- AlterTable: token opaco de reset (hash SHA-256) e expiração
ALTER TABLE "Users" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "Users" ADD COLUMN "resetTokenExpires" TIMESTAMP(3);
