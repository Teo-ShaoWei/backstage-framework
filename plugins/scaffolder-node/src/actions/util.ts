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

import { InputError } from '@backstage/errors';
import { isChildPath } from '@backstage/backend-plugin-api';
import { join as joinPath, normalize as normalizePath } from 'node:path';
import { ScmIntegrationRegistry } from '@backstage/integration';
import { trim } from 'lodash';

/**
 * @public
 */
export const getRepoSourceDirectory = (
  workspacePath: string,
  sourcePath: string | undefined,
) => {
  if (sourcePath) {
    const safeSuffix = normalizePath(sourcePath).replace(
      /^(\.\.(\/|\\|$))+/,
      '',
    );
    const path = joinPath(workspacePath, safeSuffix);
    if (!isChildPath(workspacePath, path)) {
      throw new Error('Invalid source path');
    }
    return path;
  }
  return workspacePath;
};

/**
 * @public
 */
export const parseRepoUrl = (
  repoUrl: string,
  integrations: ScmIntegrationRegistry,
): {
  repo: string;
  host: string;
  owner?: string;
  organization?: string;
  workspace?: string;
  project?: string;
} => {
  let parsed;
  try {
    parsed = new URL(`https://${repoUrl}`);
  } catch (error) {
    throw new InputError(
      `Invalid repo URL passed to publisher, got ${repoUrl}, ${error}`,
    );
  }
  const host = parsed.host;
  const type = integrations.byHost(host)?.type;

  if (!type) {
    throw new InputError(
      `No matching integration configuration for host ${host}, please check your integrations config`,
    );
  }
  const { owner, organization, workspace, project, repo } = Object.fromEntries(
    ['owner', 'organization', 'workspace', 'project', 'repo'].map(param => [
      param,
      parsed.searchParams.has(param)
        ? trim(parsed.searchParams.get(param)!, '/')
        : undefined,
    ]),
  );
  switch (type) {
    case 'bitbucketCloud': {
      checkRequiredParams(parsed, 'workspace', 'project', 'repo');
      break;
    }
    case 'bitbucketServer': {
      checkRequiredParams(parsed, 'project', 'repo');
      break;
    }
    case 'azure': {
      checkRequiredParams(parsed, 'project', 'repo');
      break;
    }
    case 'gitlab': {
      // project is the projectID, and if defined, owner and repo won't be needed.
      if (!project) {
        checkRequiredParams(parsed, 'owner', 'repo');
      }
      break;
    }
    case 'gitea': {
      checkRequiredParams(parsed, 'repo');
      break;
    }
    case 'gerrit': {
      checkRequiredParams(parsed, 'repo');
      break;
    }
    default: {
      checkRequiredParams(parsed, 'repo', 'owner');
      break;
    }
  }
  return { host, owner, repo: repo!, organization, workspace, project };
};

function checkRequiredParams(repoUrl: URL, ...params: string[]) {
  for (let i = 0; i < params.length; i++) {
    if (!repoUrl.searchParams.get(params[i])) {
      throw new InputError(
        `Invalid repo URL passed to publisher: ${repoUrl.toString()}, missing ${
          params[i]
        }`,
      );
    }
  }
}

/**
 * Filter function to exclude the .git directory and its contents
 * while keeping other files like .gitignore
 * @public
 */
export function isNotGitDirectoryOrContents(path: string): boolean {
  return !(path.endsWith('.git') || path.includes('.git/'));
}
