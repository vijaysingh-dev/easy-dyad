"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("node:fs");
var path = require("node:path");
var node_worker_threads_1 = require("node:worker_threads");
var VirtualFilesystem_1 = require("./VirtualFilesystem");
function loadLocalTypeScript(appPath) {
    try {
        // Try to load TypeScript from the project's node_modules
        var requirePath = require.resolve("typescript", { paths: [appPath] });
        var ts = require(requirePath);
        return ts;
    }
    catch (error) {
        throw new Error("Failed to load TypeScript from ".concat(appPath, " because of ").concat(error));
    }
}
function findTypeScriptConfig(appPath) {
    var possibleConfigs = [
        // For vite applications, we want to check tsconfig.app.json, since it's the
        // most important one (client-side app).
        // The tsconfig.json in vite apps is a project reference and doesn't
        // actually check anything unless you do "--build" which requires a complex
        // programmatic approach
        "tsconfig.app.json",
        // For Next.js applications, it typically has a single tsconfig.json file
        "tsconfig.json",
    ];
    for (var _i = 0, possibleConfigs_1 = possibleConfigs; _i < possibleConfigs_1.length; _i++) {
        var config = possibleConfigs_1[_i];
        var configPath = path.join(appPath, config);
        if (fs.existsSync(configPath)) {
            return configPath;
        }
    }
    throw new Error("No TypeScript configuration file found in ".concat(appPath, ". Expected one of: ").concat(possibleConfigs.join(", ")));
}
function runTypeScriptCheck(ts, vfs, _a) {
    var appPath = _a.appPath, tsconfigPath = _a.tsconfigPath, tsBuildInfoCacheDir = _a.tsBuildInfoCacheDir;
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_b) {
            return [2 /*return*/, runSingleProject(ts, vfs, {
                    appPath: appPath,
                    tsconfigPath: tsconfigPath,
                    tsBuildInfoCacheDir: tsBuildInfoCacheDir,
                })];
        });
    });
}
function runSingleProject(ts, vfs, _a) {
    var appPath = _a.appPath, tsconfigPath = _a.tsconfigPath, tsBuildInfoCacheDir = _a.tsBuildInfoCacheDir;
    return __awaiter(this, void 0, void 0, function () {
        var parsedCommandLine, options, tmpDir, configName, appHash, rootNames, virtualTsFiles, deletedFiles, _i, virtualTsFiles_1, virtualFile, host, builderProgram, diagnostics, problems, _b, diagnostics_1, diagnostic, _c, line, character, message, sourceLines, lineBefore, problematicLine, lineAfter, snippet;
        return __generator(this, function (_d) {
            parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsconfigPath, undefined, __assign(__assign({}, ts.sys), { fileExists: function (fileName) { return vfs.fileExists(fileName); }, readFile: function (fileName) { return vfs.readFile(fileName); }, onUnRecoverableConfigFileDiagnostic: function (diagnostic) {
                    throw new Error("TypeScript config error: ".concat(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")));
                } }));
            if (!parsedCommandLine) {
                throw new Error("Failed to parse TypeScript config: ".concat(tsconfigPath));
            }
            options = __assign({}, parsedCommandLine.options);
            if (!options.tsBuildInfoFile && options.incremental !== false) {
                tmpDir = tsBuildInfoCacheDir;
                if (!fs.existsSync(tmpDir)) {
                    fs.mkdirSync(tmpDir, { recursive: true });
                }
                configName = path.basename(tsconfigPath, path.extname(tsconfigPath));
                appHash = Buffer.from(appPath).toString("base64").replace(/[/+=]/g, "_");
                options.tsBuildInfoFile = path.join(tmpDir, "".concat(appHash, "-").concat(configName, ".tsbuildinfo"));
                options.incremental = true;
            }
            rootNames = parsedCommandLine.fileNames;
            virtualTsFiles = vfs
                .getVirtualFiles()
                .map(function (file) { return path.resolve(appPath, file.path); })
                .filter(isTypeScriptFile);
            deletedFiles = vfs.getDeletedFiles().map(function (file) { return path.resolve(appPath, file); });
            rootNames = rootNames.filter(function (fileName) {
                var resolvedPath = path.resolve(fileName);
                return !deletedFiles.includes(resolvedPath);
            });
            for (_i = 0, virtualTsFiles_1 = virtualTsFiles; _i < virtualTsFiles_1.length; _i++) {
                virtualFile = virtualTsFiles_1[_i];
                if (!rootNames.includes(virtualFile)) {
                    rootNames.push(virtualFile);
                }
            }
            host = createVirtualCompilerHost(ts, appPath, vfs, options);
            builderProgram = ts.createIncrementalProgram({
                rootNames: rootNames,
                options: options,
                host: host,
                configFileParsingDiagnostics: ts.getConfigFileParsingDiagnostics(parsedCommandLine),
            });
            diagnostics = __spreadArray(__spreadArray(__spreadArray([], builderProgram.getSyntacticDiagnostics(), true), builderProgram.getSemanticDiagnostics(), true), builderProgram.getGlobalDiagnostics(), true);
            // Emit the build info file to persist the incremental state
            builderProgram.emit();
            problems = [];
            for (_b = 0, diagnostics_1 = diagnostics; _b < diagnostics_1.length; _b++) {
                diagnostic = diagnostics_1[_b];
                if (!diagnostic.file)
                    continue;
                _c = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start), line = _c.line, character = _c.character;
                message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
                if (diagnostic.category !== ts.DiagnosticCategory.Error) {
                    continue;
                }
                sourceLines = diagnostic.file.getFullText().split(/\r?\n/);
                lineBefore = line > 0 ? sourceLines[line - 1] : "";
                problematicLine = sourceLines[line] || "";
                lineAfter = line < sourceLines.length - 1 ? sourceLines[line + 1] : "";
                snippet = "";
                if (lineBefore)
                    snippet += lineBefore + "\n";
                snippet += problematicLine + " // <-- TypeScript compiler error here\n";
                if (lineAfter)
                    snippet += lineAfter;
                problems.push({
                    file: normalizePath(path.relative(appPath, diagnostic.file.fileName)),
                    line: line + 1,
                    column: character + 1,
                    message: message,
                    code: diagnostic.code,
                    snippet: snippet.trim(),
                });
            }
            return [2 /*return*/, {
                    problems: problems,
                }];
        });
    });
}
function createVirtualCompilerHost(ts, appPath, vfs, compilerOptions) {
    var host = ts.createIncrementalCompilerHost(compilerOptions);
    // Override file reading to use virtual files
    host.readFile = function (fileName) {
        return vfs.readFile(fileName);
    };
    // Override file existence check
    host.fileExists = function (fileName) {
        return vfs.fileExists(fileName);
    };
    // Override getCurrentDirectory to ensure proper resolution
    host.getCurrentDirectory = function () { return appPath; };
    // Override writeFile to handle virtual file system
    // This is important for writing the tsBuildInfo file
    var originalWriteFile = host.writeFile;
    host.writeFile = function (fileName, data, writeByteOrderMark, onError) {
        // Only write build info files to disk, not emit files
        if (fileName.endsWith(".tsbuildinfo")) {
            originalWriteFile === null || originalWriteFile === void 0 ? void 0 : originalWriteFile.call(host, fileName, data, !!writeByteOrderMark, onError);
        }
        // Ignore other emit files since we're only doing type checking
    };
    return host;
}
function isTypeScriptFile(fileName) {
    var ext = path.extname(fileName).toLowerCase();
    return [".ts", ".tsx", ".js", ".jsx"].includes(ext);
}
function processTypeScriptCheck(input) {
    return __awaiter(this, void 0, void 0, function () {
        var appPath, virtualChanges, tsBuildInfoCacheDir, ts_1, vfs, tsconfigPath, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    appPath = input.appPath, virtualChanges = input.virtualChanges, tsBuildInfoCacheDir = input.tsBuildInfoCacheDir;
                    ts_1 = loadLocalTypeScript(appPath);
                    vfs = new VirtualFilesystem_1.SyncVirtualFileSystemImpl(appPath, {
                        fileExists: function (fileName) { return ts_1.sys.fileExists(fileName); },
                        readFile: function (fileName) { return ts_1.sys.readFile(fileName); },
                    });
                    vfs.applyResponseChanges(virtualChanges);
                    tsconfigPath = findTypeScriptConfig(appPath);
                    return [4 /*yield*/, runTypeScriptCheck(ts_1, vfs, {
                            appPath: appPath,
                            tsconfigPath: tsconfigPath,
                            tsBuildInfoCacheDir: tsBuildInfoCacheDir,
                        })];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, {
                            success: true,
                            data: result,
                        }];
                case 2:
                    error_1 = _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Handle messages from main thread
node_worker_threads_1.parentPort === null || node_worker_threads_1.parentPort === void 0 ? void 0 : node_worker_threads_1.parentPort.on("message", function (input) { return __awaiter(void 0, void 0, void 0, function () {
    var output;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, processTypeScriptCheck(input)];
            case 1:
                output = _a.sent();
                node_worker_threads_1.parentPort === null || node_worker_threads_1.parentPort === void 0 ? void 0 : node_worker_threads_1.parentPort.postMessage(output);
                return [2 /*return*/];
        }
    });
}); });
/**
 * Normalize the path to use forward slashes instead of backslashes.
 * This is important to prevent weird Git issues, particularly on Windows.
 * @param path Source path.
 * @returns Normalized path.
 */
function normalizePath(path) {
    return path.replace(/\\/g, "/");
}
