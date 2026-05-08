import { PrismaClient, PostType, PostSource } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Minimal seed for local development; safe to re-run.
  const user = await prisma.user.upsert({
    where: { xUserId: "mock-user-1" },
    update: {},
    create: { xUserId: "mock-user-1" },
  });

  const now = new Date();
  await prisma.post.upsert({
    where: { id: "tweet-1" },
    update: { lastSeenAt: now },
    create: {
      id: "tweet-1",
      userId: user.id,
      text: "Hello from seed data",
      createdAt: new Date(now.getTime() - 1000 * 60 * 60),
      type: PostType.NORMAL,
      source: PostSource.API_SCAN,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

