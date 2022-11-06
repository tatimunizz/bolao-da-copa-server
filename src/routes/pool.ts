import { FastifyInstance } from "fastify";
import ShortUniqueId from "short-unique-id";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../plugins/authenticate";

export async function poolRoutes(fastify: FastifyInstance) {
  fastify.get('/pools/count', async () => {
    const pools = await prisma.pool.count()
    return { count: pools }
  });

  fastify.post('/pools', async (request, reply) => {
    const createPoolBody = z.object({
      title: z.string(),
    });
    const { title } = createPoolBody.parse(request.body);
    const generate = new ShortUniqueId({ length: 6 });
    const code = String(generate()).toUpperCase();

    try {
      await request.jwtVerify();

      await prisma.pool.create({
        data: {
          title,
          code,
          ownerId: request.user.sub,

          participants: {
            create: {
              userId: request.user.sub
            }
          }
        }
      });
    } catch {
      await prisma.pool.create({
        data: {
          title,
          code,
        }
      });
    }
    
    return reply.status(201).send({ code })
  });

  fastify.post('/pools/join', { onRequest: [authenticate] }, async (request, reply) => {
    const joinPoolBody = z.object({
      code: z.string(),
    });
    const { code } = joinPoolBody.parse(request.body);

    const poll = await prisma.pool.findUnique({
      where: {
        code,  
      },
      include: {
        participants: {
          where: {
            userId: request.user.sub
          }
        }
      }
    });

    if(!poll) reply.status(400).send({ message: 'Poll not found.' });
    if(poll && poll.participants.length > 0) reply.status(400).send({ message: 'You already joined this pool.' });

    if (poll && !poll.ownerId) {
      await prisma.pool.update({
        where: {
          id: poll.id,
        },
        data: {
          ownerId: request.user.sub
        }
      });
    }

    await prisma.participant.create({
      data: {
        poolId: poll.id,
        userId: request.user.sub,
      }
    });

    return reply.status(201).send();
  });

  fastify.get('/pools', { onRequest: [authenticate] }, async (request) => {
    const polls = await prisma.pool.findMany({
      where: {
        participants: {
          some: {
            userId: request.user.sub,
          }
        }
      },
      include: {
        _count: {
          select: {
            participants: true,
          }
        },
        owner: {
          select: {
            name: true
          }
        },
        participants: {
          select: {
            id: true,
            user: {
              select: {
                avatarUrl: true,
              }
            }
          },
          take: 4,
        },
      }
    });

    return { polls }
  });

  fastify.get('/pools/:id', { onRequest: [authenticate] }, async (request) => {
    const getPoolParams = z.object({
      id: z.string(),
    });
    const { id } = getPoolParams.parse(request.params);

    const poll = await prisma.pool.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            participants: true,
          }
        },
        owner: {
          select: {
            name: true
          }
        },
        participants: {
          select: {
            id: true,

            user: {
              select: {
                avatarUrl: true,
              }
            }
          },
          take: 4,
        },
      }
    });

    return { poll }
  });

}