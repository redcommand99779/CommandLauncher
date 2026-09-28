const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Client } = require('minecraft-launcher-core');
const Handler = require('minecraft-launcher-core/components/handler');

// Mirrors minecraft-launcher-core's Client.launch() (asset/library/native/jar
// download + classpath + spawn), but without the 4 JVM flags it hardcodes
// unconditionally: -XX:-UseAdaptiveSizePolicy, -XX:-OmitStackTraceInFastThrow,
// -Dfml.ignorePatchDiscrepancies, -Dfml.ignoreInvalidMinecraftCertificates.
// The first two are old GC-tuning flags from a pre-G1GC era and the last two
// are Forge-only — all four are dead weight for Fabric/vanilla, and the GC
// flag in particular is a suspect behind an intermittent, unexplained native
// crash (0xC0000005) that a reference launcher using the identical Java
// build never hits.
// onEmitter (optional) is called synchronously with the emitter before any
// async work starts, so callers can attach 'debug'/'data' listeners without
// missing events fired during asset/library downloads.
async function launchMinecraft(opts, onEmitter) {
  const emitter = new Client(); // EventEmitter + shape Handler expects as "client"
  if (onEmitter) onEmitter(emitter);
  emitter.options = { ...opts };
  emitter.options.root = path.resolve(emitter.options.root);
  emitter.options.overrides = {
    detached: true,
    ...emitter.options.overrides,
    url: {
      meta: 'https://launchermeta.mojang.com',
      resource: 'https://resources.download.minecraft.net',
      mavenForge: 'https://files.minecraftforge.net/maven/',
      defaultRepoForge: 'https://libraries.minecraft.net/',
      fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
      ...(emitter.options.overrides ? emitter.options.overrides.url : undefined),
    },
    fw: {
      baseUrl: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/',
      version: '1.6.0',
      sh1: '035a51fe6439792a61507630d89382f621da0f1f',
      size: 28679,
      ...(emitter.options.overrides ? emitter.options.overrides.fw : undefined),
    },
  };

  const handler = new Handler(emitter);
  emitter.handler = handler;

  const java = await handler.checkJava(emitter.options.javaPath || 'java');
  if (!java.run) {
    emitter.emit('debug', `[Launch]: Couldn't start Minecraft due to: ${java.message}`);
    emitter.emit('close', 1);
    return { proc: null, emitter };
  }

  if (!fs.existsSync(emitter.options.root)) fs.mkdirSync(emitter.options.root);
  if (emitter.options.overrides.gameDirectory) {
    emitter.options.overrides.gameDirectory = path.resolve(emitter.options.overrides.gameDirectory);
    if (!fs.existsSync(emitter.options.overrides.gameDirectory)) {
      fs.mkdirSync(emitter.options.overrides.gameDirectory, { recursive: true });
    }
  }

  const directory = emitter.options.overrides.directory ||
    path.join(emitter.options.root, 'versions', emitter.options.version.custom ? emitter.options.version.custom : emitter.options.version.number);
  emitter.options.directory = directory;

  const versionFile = await handler.getVersion();
  const mcPath = emitter.options.overrides.minecraftJar || (emitter.options.version.custom
    ? path.join(emitter.options.root, 'versions', emitter.options.version.custom, `${emitter.options.version.custom}.jar`)
    : path.join(directory, `${emitter.options.version.number}.jar`));
  emitter.options.mcPath = mcPath;
  const nativePath = await handler.getNatives();

  if (!fs.existsSync(mcPath)) {
    emitter.emit('debug', '[Launch]: Attempting to download Minecraft version jar');
    await handler.getJar();
  }

  let modifyJson = null;
  if (emitter.options.forge) {
    emitter.options.forge = path.resolve(emitter.options.forge);
    emitter.emit('debug', '[Launch]: Detected Forge in options, getting dependencies');
    modifyJson = await handler.getForgedWrapped();
  } else if (emitter.options.version.custom) {
    modifyJson = JSON.parse(fs.readFileSync(
      path.join(emitter.options.root, 'versions', emitter.options.version.custom, `${emitter.options.version.custom}.json`),
      'utf8',
    ));
  }

  let jvm = [
    `-Djava.library.path=${nativePath}`,
    `-Xmx${handler.getMemory()[0]}`,
    `-Xms${handler.getMemory()[1]}`,
  ];
  if (handler.getOS() === 'osx') {
    if (parseInt(versionFile.id.split('.')[1], 10) > 12) jvm.push(await handler.getJVM());
  } else {
    jvm.push(await handler.getJVM());
  }
  if (emitter.options.customArgs) jvm = jvm.concat(emitter.options.customArgs);

  const classes = emitter.options.overrides.classes || handler.cleanUp(await handler.getClasses(modifyJson));
  const classPaths = ['-cp'];
  const separator = handler.getOS() === 'windows' ? ';' : ':';
  const file = modifyJson || versionFile;
  const jar = fs.existsSync(mcPath)
    ? `${separator}${mcPath}`
    : `${separator}${path.join(directory, `${emitter.options.version.number}.jar`)}`;
  classPaths.push(`${emitter.options.forge ? emitter.options.forge + separator : ''}${classes.join(separator)}${jar}`);
  classPaths.push(file.mainClass);

  emitter.emit('debug', '[Launch]: Attempting to download assets');
  await handler.getAssets();

  const launchOptions = await handler.getLaunchOptions(modifyJson);
  const launchArguments = [].concat(jvm, classPaths, launchOptions);

  emitter.emit('arguments', launchArguments);
  emitter.emit('debug', `[Launch]: Launching with arguments ${launchArguments.join(' ')}`);

  const proc = spawn(emitter.options.javaPath || 'java', launchArguments, {
    cwd: emitter.options.overrides.cwd || emitter.options.root,
    detached: emitter.options.overrides.detached,
  });
  proc.stdout.on('data', (d) => emitter.emit('data', d.toString('utf-8')));
  proc.stderr.on('data', (d) => emitter.emit('data', d.toString('utf-8')));
  proc.on('close', (code) => emitter.emit('close', code));

  return { proc, emitter };
}

module.exports = { launchMinecraft };
