import { FastifyInstance } from "fastify";
import { number, z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate } from "../plugins/authenticate";

export async function guessRoutes(fastify: FastifyInstance) {
  fastify.get('/guesses/count', async () => {
    const count = await prisma.guess.count()
    return { count }
  });

  fastify.post('/pools/:pollId/games/:gameId/guesses', { onRequest: [authenticate]}, async (request, reply) => {
    const createGuessParams = z.object({
      pollId: z.string(),
      gameId: z.string(),
    });

    const createGuessBody = z.object({
      firstTeamPoints: number(),
      secondTeamPoints: number(),
    })


    const { pollId, gameId } = createGuessParams.parse(request.params); 
    const { firstTeamPoints, secondTeamPoints } = createGuessBody.parse(request.body);

    const participant = await prisma.participant.findUnique({
      where: {
        userId_poolId: {
          poolId: pollId,
          userId: request.user.sub,
        }
      }
    });

    if (!participant) reply.status(400).send({ message: 'You are not allowed to create a guess inside this poll.' });

    const guess = await prisma.guess.findUnique({
      where: {
        participantId_gameId: {
          participantId: participant!.id,
          gameId
        }
      }
    });

    if(guess) reply.status(400).send({ message: 'You have already sent a guess to this game on this poll.' });

    const game = await prisma.game.findUnique({
      where: {
        id: gameId,
      }
    });

    if(!game) reply.status(400).send({ message: 'Game not found.' });

    if(game && game.date < new Date()) reply.status(400).send({ message: 'You cannot send guesses after the match.' });

    await prisma.guess.create({
      data: {
        gameId,
        participantId: participant.id,
        firstTeamPoints,
        secondTeamPoints
      }
    });

    return reply.status(201).send();


  });
}