-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cultivator" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "appearance" TEXT NOT NULL,
    "portraitSetId" TEXT,
    "portraitStatus" TEXT NOT NULL DEFAULT 'none',
    "portraitError" TEXT,
    "portraitRunId" TEXT,
    "spriteSheetId" TEXT,
    "spriteStatus" TEXT NOT NULL DEFAULT 'none',
    "spriteError" TEXT,
    "spriteRunId" TEXT,
    "paintingStartedAt" TIMESTAMP(3),

    CONSTRAINT "Cultivator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Climb" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "playerId" TEXT NOT NULL,
    "cultivatorId" TEXT NOT NULL,
    "towerId" TEXT NOT NULL,
    "towerTitle" TEXT NOT NULL,
    "floorIndex" INTEGER NOT NULL,
    "floorCount" INTEGER NOT NULL,
    "ascension" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "Climb_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cultivator_playerId_createdAt_idx" ON "Cultivator"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "Climb_playerId_updatedAt_idx" ON "Climb"("playerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Cultivator" ADD CONSTRAINT "Cultivator_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Climb" ADD CONSTRAINT "Climb_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Climb" ADD CONSTRAINT "Climb_cultivatorId_fkey" FOREIGN KEY ("cultivatorId") REFERENCES "Cultivator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
