import log from "@/logger";
import { estimateTokens } from "@/utils/token_utils";
import { extractCodebase } from "@/utils/codebase";
import { validateChatContext } from "@/utils/context_paths_utils";
import { getEeziAppPath } from "@/services/paths";

const logger = log.scope("mcp-utils");

