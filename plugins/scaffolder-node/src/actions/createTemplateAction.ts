/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ActionContext, TemplateAction } from './types';
import { z } from 'zod/v3';
import { Expand } from '@backstage/types';
import zodToJsonSchema from 'zod-to-json-schema';
import { Schema } from 'jsonschema';

/** @public */
export type TemplateExample = {
  description: string;
  example: string;
};

/** @public */
export type ZodCallback<TZodType extends z.ZodType = z.ZodType> = (
  _: typeof z,
) => TZodType;

/** @public */
export type InferZodInput<
  TSchema extends Record<string, ZodCallback> | ZodCallback<z.ZodObject<any>>,
> = TSchema extends Record<string, ZodCallback>
  ? Expand<{
      [TKey in keyof TSchema]: z.input<ReturnType<TSchema[TKey]>>;
    }>
  : TSchema extends ZodCallback<z.ZodObject<any>>
  ? z.input<ReturnType<TSchema>>
  : Record<string, never>;

/** @public */
export type InferZodOutput<
  TSchema extends Record<string, ZodCallback> | ZodCallback<z.ZodObject<any>>,
> = TSchema extends Record<string, ZodCallback>
  ? Expand<{
      [TKey in keyof TSchema]: z.output<ReturnType<TSchema[TKey]>>;
    }>
  : TSchema extends ZodCallback<z.ZodObject<any>>
  ? z.output<ReturnType<TSchema>>
  : Record<string, never>;

/**
 * Make the Zod object schema from a record of Zod callback definitions.
 * @public
 */
export function makeZodObjectSchema<
  TZodCallbackRecord extends Record<string, ZodCallback>,
>(zodCallbackRecord: TZodCallbackRecord) {
  return z.object(
    Object.fromEntries(
      Object.entries(zodCallbackRecord).map(([key, fn]) => [key, fn(z)]),
    ) as {
      [TKey in keyof TZodCallbackRecord]: ReturnType<TZodCallbackRecord[TKey]>;
    },
  );
}

const isZodCallbackRecord = (
  schema: Record<string, ZodCallback> | ZodCallback<z.ZodObject<any>>,
): schema is Record<string, ZodCallback> => {
  // From the type of `schema`, it suffices to check that it is a plain record.
  const recordSchema = z.record(z.string(), z.unknown());
  return recordSchema.safeParse(schema).success;
};

export function makeJsonSchema<
  TSchema extends Record<string, ZodCallback> | ZodCallback<z.ZodObject<any>>,
>(actionSchema?: TSchema): Schema | undefined {
  if (!actionSchema) {
    return undefined;
  }
  const zodObjectSchema = isZodCallbackRecord(actionSchema)
    ? makeZodObjectSchema(actionSchema)
    : actionSchema(z);
  return zodToJsonSchema(zodObjectSchema) as Schema;
}

/** @public */
export type TemplateActionOptions<
  TInputSchema extends
    | Record<string, ZodCallback>
    | ZodCallback<z.ZodObject<any>>,
  TOutputSchema extends
    | Record<string, ZodCallback>
    | ZodCallback<z.ZodObject<any>>,
  TSchemaType extends 'v2' = 'v2',
> = {
  id: string;
  description?: string;
  examples?: TemplateExample[];
  supportsDryRun?: boolean;
  schema?: {
    input?: TInputSchema;
    output?: TOutputSchema;
  };
  handler: (
    ctx: ActionContext<
      InferZodInput<TInputSchema>,
      InferZodOutput<TOutputSchema>,
      TSchemaType
    >,
  ) => Promise<void>;
};

/**
 * This function is used to create new template actions to get type safety.
 * Will convert zod schemas to json schemas for use throughout the system.
 * @public
 */
export function createTemplateAction<
  TInputSchema extends
    | Record<string, ZodCallback>
    | ZodCallback<z.ZodObject<any>>,
  TOutputSchema extends
    | Record<string, ZodCallback>
    | ZodCallback<z.ZodObject<any>>,
>(
  action: TemplateActionOptions<TInputSchema, TOutputSchema, 'v2'>,
): TemplateAction<
  InferZodInput<TInputSchema>,
  InferZodOutput<TOutputSchema>,
  'v2'
> {
  const inputSchema = makeJsonSchema(action.schema?.input);
  const outputSchema = makeJsonSchema(action.schema?.output);

  return {
    ...action,
    schema: {
      ...action.schema,
      input: inputSchema,
      output: outputSchema,
    },
  };
}
