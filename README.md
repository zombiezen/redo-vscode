# redo Extension for Visual Studio Code

This is a Visual Studio Code extension for [redo][].
It supports any compliant implementation of redo,
including [zombiezen/redo-rs][] and [apenwarr/redo][].

[redo]: https://redo.readthedocs.io/en/latest/
[zombiezen/redo-rs]: https://github.com/zombiezen/redo-rs
[apenwarr/redo]: https://github.com/apenwarr/redo

## Features

- **Task Detection:** Workspaces with `.do` files will automatically have [Tasks][] appear for each target

[Tasks]: https://code.visualstudio.com/docs/editor/tasks

## Requirements

A compliant `redo` tool must be installed.
See [zombiezen/redo-rs][] for one such example.

## Extension Settings

This extension contributes the following settings:

* `redo.redoPath`: Path to the `redo` program to use when running tasks.
