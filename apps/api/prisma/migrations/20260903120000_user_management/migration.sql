ALTER TABLE "users"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "users_role_isActive_idx" ON "users"("role", "isActive");
