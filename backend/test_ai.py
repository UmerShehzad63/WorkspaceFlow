import asyncio
from ai_engine import generate_briefing_summary

async def test():
    try:
        res = await generate_briefing_summary({'events':[], 'emails':[]})
        print('RESULT:', res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(test())
