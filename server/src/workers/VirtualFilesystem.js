"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncVirtualFileSystem = exports.SyncVirtualFileSystemImpl = exports.BaseVirtualFileSystem = exports.normalizePath = void 0;
var fs = require("node:fs");
var path = require("node:path");
/**
 * Normalize the path to use forward slashes instead of backslashes.
 * This is important to prevent weird Git issues, particularly on Windows.
 * @param path Source path.
 * @returns Normalized path.
 */
function normalizePath(path) {
    return path.replace(/\\/g, "/");
}
exports.normalizePath = normalizePath;
/**
 * Base class containing shared virtual filesystem functionality
 */
var BaseVirtualFileSystem = /** @class */ (function () {
    function BaseVirtualFileSystem(baseDir) {
        this.virtualFiles = new Map();
        this.deletedFiles = new Set();
        this.baseDir = path.resolve(baseDir);
    }
    /**
     * Normalize path for consistent cross-platform behavior
     */
    BaseVirtualFileSystem.prototype.normalizePathForKey = function (filePath) {
        var absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(this.baseDir, filePath);
        // Normalize separators and handle case-insensitive Windows paths
        var normalized = normalizePath(path.normalize(absolutePath));
        // Intentionally do NOT lowercase for Windows which is case-insensitive
        // because this avoids issues with path comparison.
        //
        // This is a trade-off and introduces a small edge case where
        // e.g. foo.txt and Foo.txt are treated as different files by the VFS
        // even though Windows treats them as the same file.
        //
        // This should be a pretty rare occurence and it's not worth the extra
        // complexity to handle it.
        return normalized;
    };
    /**
     * Convert normalized path back to platform-appropriate format
     */
    BaseVirtualFileSystem.prototype.denormalizePath = function (normalizedPath) {
        return process.platform === "win32"
            ? normalizedPath.replace(/\//g, "\\")
            : normalizedPath;
    };
    /**
     * Apply changes from a response containing easy-dyad tags
     */
    BaseVirtualFileSystem.prototype.applyResponseChanges = function (_a) {
        var deletePaths = _a.deletePaths, renameTags = _a.renameTags, writeTags = _a.writeTags;
        // Process deletions
        for (var _i = 0, deletePaths_1 = deletePaths; _i < deletePaths_1.length; _i++) {
            var deletePath = deletePaths_1[_i];
            this.deleteFile(deletePath);
        }
        // Process renames (delete old, create new)
        for (var _b = 0, renameTags_1 = renameTags; _b < renameTags_1.length; _b++) {
            var rename = renameTags_1[_b];
            this.renameFile(rename.from, rename.to);
        }
        // Process writes
        for (var _c = 0, writeTags_1 = writeTags; _c < writeTags_1.length; _c++) {
            var writeTag = writeTags_1[_c];
            this.writeFile(writeTag.path, writeTag.content);
        }
    };
    /**
     * Write a file to the virtual filesystem
     */
    BaseVirtualFileSystem.prototype.writeFile = function (relativePath, content) {
        var absolutePath = path.resolve(this.baseDir, relativePath);
        var normalizedKey = this.normalizePathForKey(absolutePath);
        this.virtualFiles.set(normalizedKey, content);
        // Remove from deleted files if it was previously deleted
        this.deletedFiles.delete(normalizedKey);
    };
    /**
     * Delete a file from the virtual filesystem
     */
    BaseVirtualFileSystem.prototype.deleteFile = function (relativePath) {
        var absolutePath = path.resolve(this.baseDir, relativePath);
        var normalizedKey = this.normalizePathForKey(absolutePath);
        this.deletedFiles.add(normalizedKey);
        // Remove from virtual files if it exists there
        this.virtualFiles.delete(normalizedKey);
    };
    /**
     * Rename a file in the virtual filesystem
     */
    BaseVirtualFileSystem.prototype.renameFile = function (fromPath, toPath) {
        var fromAbsolute = path.resolve(this.baseDir, fromPath);
        var toAbsolute = path.resolve(this.baseDir, toPath);
        var fromNormalized = this.normalizePathForKey(fromAbsolute);
        var toNormalized = this.normalizePathForKey(toAbsolute);
        // Mark old file as deleted
        this.deletedFiles.add(fromNormalized);
        // If the source file exists in virtual files, move its content
        if (this.virtualFiles.has(fromNormalized)) {
            var content = this.virtualFiles.get(fromNormalized);
            this.virtualFiles.delete(fromNormalized);
            this.virtualFiles.set(toNormalized, content);
        }
        else {
            // Try to read from actual filesystem
            try {
                var content = fs.readFileSync(fromAbsolute, "utf8");
                this.virtualFiles.set(toNormalized, content);
            }
            catch (error) {
                // If we can't read the source file, we'll let the consumer handle it
                console.warn("Could not read source file for rename: ".concat(fromPath), error);
            }
        }
        // Remove destination from deleted files if it was previously deleted
        this.deletedFiles.delete(toNormalized);
    };
    /**
     * Get all virtual files (files that have been written or modified)
     */
    BaseVirtualFileSystem.prototype.getVirtualFiles = function () {
        var _this = this;
        return Array.from(this.virtualFiles.entries()).map(function (_a) {
            var normalizedKey = _a[0], content = _a[1];
            // Convert normalized key back to relative path
            var denormalizedPath = _this.denormalizePath(normalizedKey);
            return {
                path: path.relative(_this.baseDir, denormalizedPath),
                content: content,
            };
        });
    };
    /**
     * Get all deleted file paths (relative to base directory)
     */
    BaseVirtualFileSystem.prototype.getDeletedFiles = function () {
        var _this = this;
        return Array.from(this.deletedFiles).map(function (normalizedKey) {
            // Convert normalized key back to relative path
            var denormalizedPath = _this.denormalizePath(normalizedKey);
            return path.relative(_this.baseDir, denormalizedPath);
        });
    };
    /**
     * Check if a file is deleted in the virtual filesystem
     */
    BaseVirtualFileSystem.prototype.isDeleted = function (filePath) {
        var normalizedKey = this.normalizePathForKey(filePath);
        return this.deletedFiles.has(normalizedKey);
    };
    /**
     * Check if a file exists in virtual files
     */
    BaseVirtualFileSystem.prototype.hasVirtualFile = function (filePath) {
        var normalizedKey = this.normalizePathForKey(filePath);
        return this.virtualFiles.has(normalizedKey);
    };
    /**
     * Get virtual file content
     */
    BaseVirtualFileSystem.prototype.getVirtualFileContent = function (filePath) {
        var normalizedKey = this.normalizePathForKey(filePath);
        return this.virtualFiles.get(normalizedKey);
    };
    return BaseVirtualFileSystem;
}());
exports.BaseVirtualFileSystem = BaseVirtualFileSystem;
/**
 * Synchronous virtual filesystem
 */
var SyncVirtualFileSystemImpl = /** @class */ (function (_super) {
    __extends(SyncVirtualFileSystemImpl, _super);
    function SyncVirtualFileSystemImpl(baseDir, delegate) {
        var _this = _super.call(this, baseDir) || this;
        _this.delegate = delegate || {};
        return _this;
    }
    /**
     * Check if a file exists in the virtual filesystem
     */
    SyncVirtualFileSystemImpl.prototype.fileExists = function (filePath) {
        // Check if file is deleted
        if (this.isDeleted(filePath)) {
            return false;
        }
        // Check if file exists in virtual files
        if (this.hasVirtualFile(filePath)) {
            return true;
        }
        // Delegate to custom fileExists if provided
        if (this.delegate.fileExists) {
            return this.delegate.fileExists(filePath);
        }
        // Fall back to actual filesystem
        var absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(this.baseDir, filePath);
        return fs.existsSync(absolutePath);
    };
    /**
     * Read a file from the virtual filesystem
     */
    SyncVirtualFileSystemImpl.prototype.readFile = function (filePath) {
        // Check if file is deleted
        if (this.isDeleted(filePath)) {
            return undefined;
        }
        // Check virtual files first
        var virtualContent = this.getVirtualFileContent(filePath);
        if (virtualContent !== undefined) {
            return virtualContent;
        }
        // Delegate to custom readFile if provided
        if (this.delegate.readFile) {
            return this.delegate.readFile(filePath);
        }
        // Fall back to actual filesystem
        try {
            var absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.resolve(this.baseDir, filePath);
            return fs.readFileSync(absolutePath, "utf8");
        }
        catch (_a) {
            return undefined;
        }
    };
    /**
     * Create a custom file system interface for other tools
     */
    SyncVirtualFileSystemImpl.prototype.createFileSystemInterface = function () {
        var _this = this;
        return {
            fileExists: function (fileName) { return _this.fileExists(fileName); },
            readFile: function (fileName) { return _this.readFile(fileName); },
            writeFile: function (fileName, content) {
                return _this.writeFile(fileName, content);
            },
            deleteFile: function (fileName) { return _this.deleteFile(fileName); },
        };
    };
    return SyncVirtualFileSystemImpl;
}(BaseVirtualFileSystem));
exports.SyncVirtualFileSystemImpl = SyncVirtualFileSystemImpl;
/**
 * Asynchronous virtual filesystem
 */
var AsyncVirtualFileSystem = /** @class */ (function (_super) {
    __extends(AsyncVirtualFileSystem, _super);
    function AsyncVirtualFileSystem(baseDir, delegate) {
        var _this = _super.call(this, baseDir) || this;
        _this.delegate = delegate || {};
        return _this;
    }
    /**
     * Check if a file exists in the virtual filesystem
     */
    AsyncVirtualFileSystem.prototype.fileExists = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var absolutePath, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        // Check if file is deleted
                        if (this.isDeleted(filePath)) {
                            return [2 /*return*/, false];
                        }
                        // Check if file exists in virtual files
                        if (this.hasVirtualFile(filePath)) {
                            return [2 /*return*/, true];
                        }
                        // Delegate to custom fileExists if provided
                        if (this.delegate.fileExists) {
                            return [2 /*return*/, this.delegate.fileExists(filePath)];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.resolve(this.baseDir, filePath);
                        return [4 /*yield*/, fs.promises.access(absolutePath)];
                    case 2:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 3:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Read a file from the virtual filesystem
     */
    AsyncVirtualFileSystem.prototype.readFile = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var virtualContent, absolutePath, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        // Check if file is deleted
                        if (this.isDeleted(filePath)) {
                            return [2 /*return*/, undefined];
                        }
                        virtualContent = this.getVirtualFileContent(filePath);
                        if (virtualContent !== undefined) {
                            return [2 /*return*/, virtualContent];
                        }
                        // Delegate to custom readFile if provided
                        if (this.delegate.readFile) {
                            return [2 /*return*/, this.delegate.readFile(filePath)];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        absolutePath = path.isAbsolute(filePath)
                            ? filePath
                            : path.resolve(this.baseDir, filePath);
                        return [4 /*yield*/, fs.promises.readFile(absolutePath, "utf8")];
                    case 2: return [2 /*return*/, _b.sent()];
                    case 3:
                        _a = _b.sent();
                        return [2 /*return*/, undefined];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return AsyncVirtualFileSystem;
}(BaseVirtualFileSystem));
exports.AsyncVirtualFileSystem = AsyncVirtualFileSystem;
