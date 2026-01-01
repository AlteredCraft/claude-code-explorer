import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), '.config', 'app.json');

export interface AppSettings {
  pathPrefix: string[];
}

const defaultSettings: AppSettings = {
  pathPrefix: [],
};

export async function GET() {
  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    const settings = JSON.parse(content) as AppSettings;
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(defaultSettings);
  }
}

export async function PUT(request: Request) {
  try {
    const settings = await request.json() as AppSettings;

    // Ensure .config directory exists
    await mkdir(join(process.cwd(), '.config'), { recursive: true });

    // Write settings
    await writeFile(CONFIG_PATH, JSON.stringify(settings, null, 2));

    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
