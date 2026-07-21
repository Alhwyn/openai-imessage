> ## Documentation Index
>
> Fetch the complete documentation index at: [/docs/llms.txt](https://photon.codes/docs/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://photon.codes/docs/spectrum-ts/platform-narrowing#content-area)

Every platform provider exports a callable — `imessage`, `localIMessage`,
`slack`, `terminal`, `whatsappBusiness`, `telegram` — that **narrows** generic
Spectrum types into platform-specific ones. The same function handles three
different inputs.

## [​](https://photon.codes/docs/spectrum-ts/platform-narrowing\#narrowing-the-app)  Narrowing the app

Pass a `SpectrumInstance` to get a `PlatformInstance` for that platform. The platform instance gives you `user()` and `space.create()` / `space.get()` resolvers, plus access to any custom events the provider emits.

```
import { imessage } from "spectrum-ts/providers/imessage";

const im = imessage(app);

const user = await im.user("+15551234567");
const space = await im.space.create(user);

await space.send("Hello from a new conversation.");
```

If the platform isn’t registered in the `providers` array, the type of `imessage(app)` resolves to `never` — the call is a compile-time error.

## [​](https://photon.codes/docs/spectrum-ts/platform-narrowing\#narrowing-a-space)  Narrowing a space

Pass an existing space to access platform-specific fields:

```
for await (const [space, message] of app.messages) {
  if (message.platform !== "imessage") continue;

  const imessageSpace = imessage(space);
  if (imessageSpace.type === "group") {
    // group chat logic — `type` only exists on iMessage spaces
  }
}
```

Narrowing a space from the wrong platform logs a structured warning at runtime. Always gate on `message.platform` (or a similar signal) first to avoid unexpected behavior.The local macOS provider is a separate platform. Gate on
`message.platform === "local_imessage"` and narrow with `localIMessage(...)`;
the cloud provider continues to use `"imessage"` and `imessage(...)`.

## [​](https://photon.codes/docs/spectrum-ts/platform-narrowing\#narrowing-a-message)  Narrowing a message

Same idea for messages — useful when a provider declares a `message.schema` to attach extra properties:

```
for await (const [space, message] of app.messages) {
  if (message.platform !== "imessage") continue;
  const imessageMessage = imessage(message);
  // imessageMessage carries any iMessage-specific fields
}
```

## [​](https://photon.codes/docs/spectrum-ts/platform-narrowing\#creating-group-conversations)  Creating group conversations

`space.create(...)` accepts a single user or an array of users. On iMessage:

```
const im = imessage(app);
const alice = await im.user("+15551111111");
const bob = await im.user("+15552222222");

const group = await im.space.create([alice, bob]);
await group.send("Welcome to the group.");
```

Some platforms support an additional `params` argument for extra space creation options — the shape of those params is defined per-provider through `space.params` on the platform definition.

## [​](https://photon.codes/docs/spectrum-ts/platform-narrowing\#why-narrowing-matters)  Why narrowing matters

The generic `Space` and `Message` interfaces are deliberately small — just enough to send, react, and reply across every platform. Narrowing is the escape hatch for everything else: typed access to iMessage chat types, WhatsApp phone numbers, or any extra field your [custom platform](https://photon.codes/docs/spectrum-ts/custom-platforms) exposes.

Was this page helpful?

YesNo

[Reactions and Replies\\
\\
Previous](https://photon.codes/docs/spectrum-ts/reactions-and-replies) [Webhooks\\
\\
Next](https://photon.codes/docs/spectrum-ts/webhooks)

Ctrl+I

Assistant

Responses are generated using AI and may contain mistakes.