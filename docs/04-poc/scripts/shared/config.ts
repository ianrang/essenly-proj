/**
 * PoC 공유 설정 — AI 프로바이더 및 모델 설정
 *
 * 프로바이더 전환: .env.local의 AI_PROVIDER 값 변경
 *   - google: Gemini (기본, PoC용)
 *   - anthropic: Claude (추후 전환)
 *   - openai: GPT (추후 전환)
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// .env.local 로드 (프로젝트 루트 기준)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env.local') });

type Provider = 'google' | 'anthropic' | 'openai';

const provider = (process.env.AI_PROVIDER ?? 'google') as Provider;

export async function getModel() {
  switch (provider) {
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      // gemini-2.0-flash: 최저가, TTFT 최소. P0-12 100%, P0-13 스트리밍 안정.
      // gemini-2.5-flash: thinking 기능으로 TTFT 2~7초 (더 느림). 비추.
      // gemini-2.5-pro: 최고 품질, 12배 비쌈.
      return google('gemini-2.0-flash');
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic('claude-sonnet-4-5-20250929');
    }
    case 'openai': {
      // npm install @ai-sdk/openai 필요
      const { openai } = await import('@ai-sdk/openai');
      return openai('gpt-4o');
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

export { provider };
