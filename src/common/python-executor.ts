// src/common/python-executor.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Trouve le bon exécutable Python disponible dans le système
 * Essaie python3, python, puis python3.11
 */
export async function findPythonExecutable(): Promise<string> {
  const candidates = ['python3', 'python', 'python3.11', '/usr/bin/python3', '/usr/bin/python'];
  
  for (const candidate of candidates) {
    try {
      const { stdout } = await execAsync(`which ${candidate} || command -v ${candidate}`);
      const pythonPath = stdout.trim();
      if (pythonPath) {
        // Vérifier que TensorFlow est disponible
        try {
          await execAsync(`${pythonPath} -c "import tensorflow; print('OK')" 2>/dev/null`);
          console.log(`✅ Python trouvé avec TensorFlow: ${pythonPath}`);
          return pythonPath;
        } catch {
          // Continuer à chercher
        }
      }
    } catch {
      // Continuer à chercher
    }
  }
  
  // Fallback: retourner python3 par défaut
  console.warn('⚠️ Python avec TensorFlow non trouvé, utilisation de python3 par défaut');
  return 'python3';
}

/**
 * Exécute un script Python avec les arguments donnés
 */
export async function executePythonScript(
  scriptPath: string,
  args: string[],
  inputData?: string,
  timeout: number = 30000,
): Promise<{ stdout: string; stderr: string }> {
  const pythonExec = await findPythonExecutable();
  const fullArgs = [scriptPath, ...args];
  
  return new Promise((resolve, reject) => {
    const aiModelsDir = join(process.cwd(), 'AI-Models');
    const pythonProcess = spawn(pythonExec, fullArgs, {
      cwd: aiModelsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: process.env.PYTHONPATH || join(process.cwd(), 'AI-Models'),
      },
    });

    let stdout = '';
    let stderr = '';

    if (inputData) {
      pythonProcess.stdin.write(inputData);
      pythonProcess.stdin.end();
    }

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 && !stdout.includes('success')) {
        reject(new Error(`Script Python terminé avec le code ${code}. stderr: ${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    pythonProcess.on('error', (error) => {
      reject(new Error(`Erreur lors du lancement du script Python: ${error.message}`));
    });

    const timeoutId = setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error(`Timeout: Le script Python a pris plus de ${timeout / 1000} secondes à s'exécuter`));
    }, timeout);

    pythonProcess.on('close', () => {
      clearTimeout(timeoutId);
    });
  });
}

/**
 * Exécute une commande Python avec exec (pour les commandes simples)
 */
export async function executePythonCommand(
  command: string,
  timeout: number = 30000,
): Promise<{ stdout: string; stderr: string }> {
  const pythonExec = await findPythonExecutable();
  const fullCommand = command.replace(/^python3?\s+/, `${pythonExec} `);
  
  return execAsync(fullCommand, {
    timeout,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: process.env.PYTHONPATH || join(process.cwd(), 'AI-Models'),
    },
  });
}

