// Copyright 2021 Ross Light
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

import * as path from 'path';
import * as vscode from 'vscode';

export class RedoTaskProvider implements vscode.Disposable, vscode.TaskProvider {
  static readonly RedoType: 'redo' = 'redo';
  private workspaceStates: Map<string, WorkspaceState>;
  private folderChangeListener: vscode.Disposable;

  constructor() {
    this.workspaceStates = new Map();
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        this.addWorkspace(folder);
      }
    }
    this.folderChangeListener = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      for (const folder of e.added) {
        this.addWorkspace(folder);
      }
      for (const folder of e.removed) {
        const key = folder.uri.toString();
        const state = this.workspaceStates.get(key);
        if (state) {
          state.dispose();
        }
        this.workspaceStates.delete(key);
      }
    });
  }

  private addWorkspace(folder: vscode.WorkspaceFolder) {
    const key = folder.uri.toString();
    if (this.workspaceStates.has(key)) {
      return;
    }
    this.workspaceStates.set(key, new WorkspaceState(folder));
  }

  public async provideTasks(): Promise<vscode.Task[]> {
    // TODO(light): Cancel promise as appropriate.
    const promises = [];
    for (const state of this.workspaceStates.values()) {
      promises.push(state.tasksPromise);
    }
    const taskLists = await Promise.all(promises);
    return taskLists.reduce((acc, val) => acc.concat(val), []);
  }

  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    if (!isRedoTaskDefinition(task.definition) || typeof task.scope !== 'object') {
      return undefined;
    }
    const config = vscode.workspace.getConfiguration(configSection, task.scope);
    task.execution = taskExecution(task.definition, config.get('redoPath', 'redo'));
    return task;
  }

  dispose() {
    for (const state of this.workspaceStates.values()) {
      state.dispose();
    }
    this.folderChangeListener.dispose();
  }
}

const EXT = '.do';

class WorkspaceState implements vscode.Disposable {
  private folder: vscode.WorkspaceFolder;
  private buildFileWatcher: vscode.FileSystemWatcher;
  private configChanged: vscode.Disposable;
  private _tasksPromise: Thenable<vscode.Task[]> | undefined;

  constructor(folder: vscode.WorkspaceFolder) {
    this.folder = folder;
    const pattern = path.join(folder.uri.fsPath, '**', '*' + EXT);
    this.buildFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.buildFileWatcher.onDidChange(() => this.invalidateTasks());
    this.buildFileWatcher.onDidCreate(() => this.invalidateTasks());
    this.buildFileWatcher.onDidDelete(() => this.invalidateTasks());
    this.configChanged = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(configSection, folder)) {
        this.invalidateTasks();
      }
    });
  }

  get tasksPromise(): Thenable<vscode.Task[]> {
    if (!this._tasksPromise) {
      this._tasksPromise = getRedoTasks(this.folder);
    }
    return this._tasksPromise;
  }

  invalidateTasks(): void {
    this._tasksPromise = undefined;
  }

  dispose() {
    this.buildFileWatcher.dispose();
    this.configChanged.dispose();
  }
}

interface RedoTaskDefinition extends vscode.TaskDefinition {
  readonly type: 'redo';
  readonly target: string;
}

function isRedoTaskDefinition(defn: any): defn is RedoTaskDefinition {
  return defn.type === RedoTaskProvider.RedoType && 'target' in defn;
}

async function getRedoTasks(folder: vscode.WorkspaceFolder): Promise<vscode.Task[]> {
  if (!folder.uri.fsPath) {
    return [];
  }
  const config = vscode.workspace.getConfiguration(configSection, folder);
  const redoPath = config.get('redoPath', 'redo');
  const pattern = new vscode.RelativePattern(folder, '**/*' + EXT);
  const files = await vscode.workspace.findFiles(pattern);
  const tasks: vscode.Task[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const base = path.basename(f.fsPath);
    if (base.startsWith('default.')) {
      continue;
    }
    const definition: RedoTaskDefinition = {
      type: RedoTaskProvider.RedoType,
      target: path.relative(folder.uri.fsPath, f.fsPath.substr(0, f.fsPath.length - EXT.length)),
    };
    const task = new vscode.Task(
      definition,
      folder,
      definition.target,
      'redo',
      taskExecution(definition, redoPath),
    );
    task.group = vscode.TaskGroup.Build;
    tasks.push(task);
  }
  return tasks;
}

/** VSCode configuration section for this extension. */
const configSection = 'redo';

/** Return the invocation for a task. */
function taskExecution(definition: RedoTaskDefinition, redoPath: string): vscode.ProcessExecution {
  return new vscode.ProcessExecution(redoPath, ['--', definition.target]);
}
