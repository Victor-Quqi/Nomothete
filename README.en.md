[中文](./README.md) · English

# Nomothete

Nomothete is a naming tool for software projects. It runs on your machine and you use it in the browser. From a description of the project it generates names, each with a note on what it means and where it comes from, and looks up whether the name is used for packages, GitHub repositories and domains. Whether a name is right is for you to judge.

The word comes from νομοθέτης in Plato's *Cratylus*: "the one who sets names".

## Install and start

You need Node.js 24 or later and an API key for a model service.

```bash
npx nomothete --open
```

The first start asks for the API endpoint, the model and the key. The endpoint and the model can be left empty, in which case DeepSeek is used. Once the server is up the browser opens, by default at [http://localhost:5179](http://localhost:5179). You can change the connection later under "Settings" in the bottom-left corner, or run the setup again:

```bash
npx nomothete --setup
```

Use `--port` to choose a port and `--verbose` to log requests:

```bash
npx nomothete --port 7000 --verbose
```

By default only this machine can connect. When installed from npm or started with npx, the model configuration and your sessions are kept in `~/.nomothete/`. A saved API key shows only its last four characters in Settings. Model services and other settings are described in the [configuration guide](./docs/configuration.md) (Chinese).

You can also run it from source:

```bash
git clone https://github.com/Victor-Quqi/Nomothete.git
cd Nomothete
npm install
npm start
```

Run from source, the configuration and sessions are kept in the project directory.

The interface is in Chinese and English. It starts in your system's language and can be switched in Settings. Generated names and their meanings are written in the language of your project description.

## Using it

Start a session and describe the project. You can add names you already have in mind and mark whether you like them. Names are generated with different methods, such as root compounds, allusions and old words, and every name comes with its meaning.

Mark names with `▼▼ ▼ · ▲ ▲▲`, from dislike to like, with undecided in the middle. Your marks and notes steer the batches that follow, and a mark can be changed or undone. Press `t` to see what the session has inferred about your taste, and what it is based on.

Press `p` to adjust the leanings generation follows, for example whether to favour names that are easy to spell and say. Each can be switched on or off on its own and shows its strength of evidence, what it rests on, and when it does not apply.

Names are filtered by how rare the model expects them to be, which you set with the "rarity floor". The higher the floor, the stricter the filter. Dropped names do not come up again. Click "N dropped" in the bottom bar to see them and keep any you want.

The arrow beside "Another batch" lets you give the next batch a direction in one line, or pick the methods it uses. From a name's details you can ask for another batch from that name: the new names reach for what it does by other routes, through its source, its sound or its angle.

Names are shown by batch, newest first, and in order of arrival within a batch. You can search names and meanings, filter by mark, family, batch or what the checks found, and sort by expected rarity or by the number of problems the checks found.

Sessions are saved as you go and can be renamed, pinned and deleted. The Markdown export includes the names, your marks and notes, and the check results.

## Name checks

| What is checked | When |
| --- | --- |
| Whether the name is valid on npm, PyPI and crates.io | After generation |
| Whether it matches a package name already recorded locally | After generation |
| Whether npm, PyPI and crates.io have a package by that name | After generation |
| Related packages that turn up in an npm search | After generation |
| Whether other spellings would be treated as the same name by the registries | After you mark it `▲` or `▲▲` |
| GitHub repositories with the name in theirs | After you mark it `▲` or `▲▲` |
| Registration records for the `.com`, `.dev` and `.io` domains | After you mark it `▲` or `▲▲` |

"No record" means this lookup found no matching record. Whether a registry accepts the name is still up to the registry when you publish.

Once you mark a name `▲` or `▲▲`, the meaning is also checked against sources on the web. If something contradicts it, the card says so, and the details list the claim, an excerpt and a link to the source. Claims not yet confirmed are listed as "unconfirmed" and can be searched in your browser. The export keeps the findings and their sources.

The source check can be switched off in Settings.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `j` / `↓` | Next name |
| `k` / `↑` | Previous name |
| `1` to `5` | Mark the name `▼▼ ▼ · ▲ ▲▲` and move to the next |
| `u` | Undo the last mark |
| `Shift+J` | Next undecided name |
| `Enter` | Show details |
| `n` | Edit the note |
| `s` | Say the name |
| `c` | Copy the name |
| `g` | Generate another batch |
| `Shift+G` | Give a direction or pick methods, then generate |
| `f` | Another batch from the selected name |
| `e` | Export Markdown |
| `/` | Search |
| `t` | Your taste in this session |
| `p` | Adjust the leanings |
| `⌘K` / `Ctrl+K` | Command palette |
| `?` | Shortcuts |
| `Esc` | Deselect or close the panel |

## Documentation

These are in Chinese.

- [Configuration](./docs/configuration.md)
- [Scope and vocabulary](./CONTEXT.md)
- [Design notes](./docs/design.md)
- [Code structure and API](./docs/architecture.md)
- [Naming research](./docs/research/naming-corpus.md)

Released under the [MIT License](./LICENSE).
