#!/usr/bin/env python3
"""Bridge: read JSON {items:[{id,context}], model} from stdin, emit {results:{id:summary}}.
Uses the Emergent LLM key via emergentintegrations (Gemini flash). Kept resilient:
on any failure it emits an empty/partial map so the PHP caller can fall back gracefully."""
import sys, json, os, asyncio


def emit(results, error=None):
    out = {"results": results}
    if error:
        out["error"] = str(error)
    sys.stdout.write(json.dumps(out))
    sys.stdout.flush()


def main():
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        return emit({}, e)

    items = payload.get("items", []) or []
    model = payload.get("model", "gemini-3-flash-preview")
    key = os.environ.get("EMERGENT_LLM_KEY")
    results = {}

    if not key or not items:
        return emit(results)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        return emit(results, e)

    sysmsg = (
        "You are a real-estate CRM sales assistant. In ONE short sentence (max 22 words), "
        "summarize this lead's recent conversation and where they stand — focus on their interest, "
        "budget, property type, timeline and the single next best action. "
        "Plain text only: no preamble, no quotes, no markdown, no lead name."
    )

    async def run():
        for it in items:
            lid = str(it.get("id"))
            ctx = (it.get("context") or "").strip()[:4000]
            if not ctx:
                continue
            try:
                chat = LlmChat(
                    api_key=key,
                    session_id="lead-summary-" + lid,
                    system_message=sysmsg,
                ).with_model("gemini", model)
                msg = UserMessage(text=ctx)
                text = ""
                try:
                    resp = await chat.send_message(msg)
                    text = resp if isinstance(resp, str) else str(resp)
                except Exception:
                    from emergentintegrations.llm.chat import TextDelta, StreamDone
                    async for ev in chat.stream_message(msg):
                        if isinstance(ev, TextDelta):
                            text += ev.content
                        elif isinstance(ev, StreamDone):
                            break
                text = (text or "").strip().strip('"').strip()
                if text:
                    results[lid] = text
            except Exception:
                continue

    try:
        asyncio.run(run())
    except Exception as e:
        return emit(results, e)
    emit(results)


if __name__ == "__main__":
    main()
