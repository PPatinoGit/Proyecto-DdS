/*
 Request validation shared by the API handlers.

 Only the server imports this module: it depends on Zod and the browser bundle
 does not need it. Types for the browser live in src/lib/types.ts.
*/

import { z } from "zod";
import {
  MAX_ATTACHMENTS,
  MAX_EMAIL_MESSAGE,
  MAX_EMAIL_SUBJECT,
} from "./email-limits.js";

/*
 Dates arrive from <input type="datetime-local"> as "YYYY-MM-DDTHH:mm", so they
 have no timezone. Date.parse() reads them as local time, which is what the
 admin sees in the form. The API stores the ISO version in UTC.
*/
const dateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "invalid_date" });

export const electionInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    opensAt: dateString.nullable(),
    closesAt: dateString.nullable(),
  })
  .refine(
    ({ opensAt, closesAt }) =>
      opensAt === null || closesAt === null || Date.parse(closesAt) > Date.parse(opensAt),
    { message: "invalid_range", path: ["closesAt"] },
  );

export type ElectionInputPayload = z.infer<typeof electionInputSchema>;

/*
 Attachment contents travel as base64 inside the JSON body. Size and base64
 syntax are checked in the handler (it needs Buffer); Zod only checks shape.
*/
const mailAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contentType: z.string().trim().min(1).max(120),
  data: z.string().min(1),
});

export const emailSendSchema = z
  .object({
    electionId: z.number().int().positive(),
    language: z.enum(["es", "en", "ru"]),
    subject: z.string().trim().max(MAX_EMAIL_SUBJECT).nullable(),
    message: z.string().trim().max(MAX_EMAIL_MESSAGE).nullable(),
    attachments: z.array(mailAttachmentSchema).max(MAX_ATTACHMENTS),
    /* Chunks stay small so every request finishes well within the function limit. */
    personIds: z.array(z.number().int().positive()).max(25).default([]),
    test: z.boolean().default(false),
  })
  .refine(({ test, personIds }) => test || personIds.length > 0, {
    message: "no_recipients",
  });

export type EmailSendPayload = z.infer<typeof emailSendSchema>;

/*
 Ballot definition: the admin sends the complete list of motions for one
 election. Replacing everything in one request keeps the editor simple and
 lets the server write it in a single transaction.
*/
const motionOptionInputSchema = z.string().trim().min(1).max(120);

const motionInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    options: z.array(motionOptionInputSchema).min(2).max(8),
  })
  .refine(
    ({ options }) => new Set(options.map((label) => label.toLocaleLowerCase())).size === options.length,
    { message: "duplicate_option" },
  );

export const motionsInputSchema = z.object({
  electionId: z.number().int().positive(),
  motions: z.array(motionInputSchema).max(40),
});

export type MotionsInputPayload = z.infer<typeof motionsInputSchema>;

/** Publishing and closing an election are explicit admin actions. */
export const electionStatusSchema = z.object({
  electionId: z.number().int().positive(),
  status: z.enum(["open", "closed"]),
});

export type ElectionStatusPayload = z.infer<typeof electionStatusSchema>;

/** One complete ballot: exactly one option chosen for every motion. */
export const voteInputSchema = z
  .object({
    votes: z
      .array(
        z.object({
          motionId: z.number().int().positive(),
          optionId: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(40),
  })
  .refine(
    ({ votes }) => new Set(votes.map((vote) => vote.motionId)).size === votes.length,
    { message: "duplicate_motion" },
  );

export type VoteInputPayload = z.infer<typeof voteInputSchema>;

/*
 Questionnaires: the admin writes free-text questions and the server assigns a
 category to each one. The cap keeps the whole write inside one transaction.
*/
export const questionnaireInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ownerId: z.number().int().positive(),
  questions: z.array(z.string().trim().min(1).max(1000)).min(1).max(100),
});

export type QuestionnaireInputPayload = z.infer<typeof questionnaireInputSchema>;

/** One answer is written by the current responsible of that question. */
export const questionnaireAnswerSchema = z.object({
  questionId: z.number().int().positive(),
  body: z.string().trim().min(1).max(5000),
});

export type QuestionnaireAnswerPayload = z.infer<typeof questionnaireAnswerSchema>;

/** One or more questions move to another person of the organization at once. */
export const questionnaireDelegationSchema = z
  .object({
    questionIds: z.array(z.number().int().positive()).min(1).max(100),
    toPersonId: z.number().int().positive(),
  })
  .refine(({ questionIds }) => new Set(questionIds).size === questionIds.length, {
    message: "duplicate_question",
  });

export type QuestionnaireDelegationPayload = z.infer<typeof questionnaireDelegationSchema>;
