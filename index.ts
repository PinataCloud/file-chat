import { PinataSDK } from "pinata";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY })

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY,
});

Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(Bun.file("./index.html"))
    };
    if (url.pathname === "/upload") {
      if (req.method === "POST") {
        try {
          const formData = await req.formData()
          const file: any = formData.get("file")
          if (!file) {
            return new Response("No file provided", { status: 400 })
          }
          const upload = await pinata.upload.file(file);

          return new Response(upload.cid, { status: 201 });
        } catch (error) {
          console.log(error)
          return new Response("Server error", { status: 500 });
        }
      }
    }
    if (url.pathname.includes("/chat/")) {
      const cid = url.pathname.split("chat/")[1]
      if (!cid) {
        return new Response("No CID provided", { status: 400 })
      }
      if (req.method === "GET") {
        try {
          const file = await pinata.gateways.get(cid)
          return Response.json({ messages: file }, { status: 200 })
        } catch (error) {
          //  This is a stop gap for if the CID doesn't exist. We should just return an empty array
          return Response.json({ messages: [] }, { status: 200 })
        }
      } else if (req.method === "POST") {
        try {
          //  The body will have the chat message
          const body: any = await req.json()

          //  Get the file we're using
          const result: any = await pinata.gateways.get(cid)

          const text = result.data

          //  Message history
          let messages: any = []
          if (body.messagesCid) {
            const res = await pinata.gateways.get(body.messagesCid)
            messages = res.data;
            console.log(messages)
          }
          const systemMessage = [{ role: "system", content: `You are a helpful assistant answering questions about a document represented like this: ${text}` }]

          const openAiMessages = [...messages, ...systemMessage]

          openAiMessages.push({
            role: "user",
            content: body.message
          })

          const completion = await openai.chat.completions.create({
            messages: openAiMessages,
            model: "gpt-4o",
          });

          console.log(completion.choices[0]);
          //  Save message history without system message
          messages.push(completion.choices[0].message)
          console.log({ messages })
          const upload = await pinata.upload.json(messages)

          return Response.json({ message: completion.choices[0].message.content, messagesCid: upload.cid })
        } catch (error) {
          console.log(error)
          return new Response("Server error", { status: 500 });
        }
      }
    }
    return new Response("404!");
  },
});