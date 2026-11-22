ALTER TABLE "user_invitations" ADD COLUMN "activation_qr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "activation_qr_code" TEXT;
ALTER TABLE "departments" ADD COLUMN "activation_qr_code" TEXT;
CREATE UNIQUE INDEX "organizations_activation_qr_code_key" ON "organizations"("activation_qr_code");
CREATE UNIQUE INDEX "departments_activation_qr_code_key" ON "departments"("activation_qr_code");
