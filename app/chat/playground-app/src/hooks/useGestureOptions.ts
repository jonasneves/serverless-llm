import { useState, useEffect } from 'react';

export interface GestureOption {
  id: string;
  label: string;
  action: 'message' | 'confirm' | 'choice';
  value: string;
}

export function useGestureOptions(content: string): GestureOption[] {
  const [options, setOptions] = useState<GestureOption[]>([]);

  useEffect(() => {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        let jsonStr = jsonMatch[1];

        jsonStr = jsonStr
          .replace(/[\\']/g, '"')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/}\s*[\\]+\s*$/g, '}')
          .replace(/"\s*"\s*$/g, '')
          .trim();

        const data = JSON.parse(jsonStr);
        if (data.options && Array.isArray(data.options)) {
          const validOptions = data.options.filter((opt: any) =>
            opt.id && opt.label && opt.value
          );
          if (validOptions.length > 0) {
            setOptions(validOptions);
          } else {
            setOptions([]);
          }
        }
      } catch (e) {
        console.error('Failed to parse gesture options:', e);
        setOptions([]);
      }
    } else {
      setOptions([]);
    }
  }, [content]);

  return options;
}

export function extractTextWithoutJSON(content: string): string {
  return content.replace(/```json[\s\S]*?```/g, '').trim();
}
