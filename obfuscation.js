function base64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function obfuscateGS2(script) {
  // Obfuscates string literals by base64 encoding them
  const obfuscateString = (match, quote, content) => {
    return `base64decode("${base64Encode(content)}")`;
  };

  // Obfuscates object properties by encoding each part in base64
  const obfuscateProperties = (match, base, props) => {
    const properties = props.split(".");
    const obfuscatedProperties = properties.map((prop) => `(@base64decode("${base64Encode(prop)}"))`);
    return `(@base64decode("${base64Encode(base)}")).${obfuscatedProperties.join(".")}`;
  };

  // Obfuscates numbers by encoding them into base64 and using int() or float()
  const obfuscateNumber = (match, number) => {
    const num = parseFloat(number); // Convert to number
    if (Number.isInteger(num)) {
      return `int(base64decode("${base64Encode(number)}"))`; // Use int() for integers
    } else {
      return `float(base64decode("${base64Encode(number)}"))`; // Use float() for non-integers
    }
  };

  // Obfuscates function calls, avoiding certain keywords like "if" and "for"
  const obfuscateFunctionCall = (match, funcName, params) => {
    // Some common GS2 keywords
    const scriptKeyWords = ["if", "while", "switch", "with", "for", "new"];

    // Don't obfuscate base64decode and float
    if (funcName === "base64decode" || funcName === "float" || funcName === "int") {
      return `${funcName}(${params})`;
    }

    // Skip obfuscation for certain keywords
    if (scriptKeyWords.includes(funcName)) {
      return `${funcName} (${params})`;
    }

    const obfuscatedName = `(@base64decode("${base64Encode(funcName)}"))`;
    return params.trim() === "" ? `${obfuscatedName}()` : `${obfuscatedName}(${params})`;
  };

  // Regular expressions to match function declarations, assignments, and function calls
  const functionDeclarationRegex = /function\s+([\w.$]+)\s*\(([^)]*)\)/g;
  const functionAssignmentRegex = /([\w.$]+)\s*=\s*function\s*\(([^)]*)\)/g;
  const functionCallRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/g;
  const stringRegex = /(["'`])(.*?)\1/g;

  let functionHeaders = [];
  script = script.replace(functionDeclarationRegex, (match, funcName, funcArgs) => {
    functionHeaders.push(`function ${funcName}(${funcArgs || ""})`);
    return `/*FUNCTION_PLACEHOLDER_${functionHeaders.length - 1}*/`;
  });

  script = script.replace(functionAssignmentRegex, (match, funcName, funcArgs) => {
    functionHeaders.push(`${funcName} = function(${funcArgs || ""})`);
    return `/*FUNCTION_PLACEHOLDER_${functionHeaders.length - 1}*/`;
  });

  // Process each line to obfuscate strings, numbers, properties, and function calls
  const lines = script.split("\n");
  const processedLines = lines.map((line) => {
    if (line.trim().startsWith("//")) return line; // Skip comments
    return line
      .replace(stringRegex, obfuscateString)
      .replace(/(\d*\.\d+|\.\d+)\b/g, obfuscateNumber)
      .replace(/\b(\w+)\.([\w.]+)\b/g, obfuscateProperties)
      .replace(/\b(\d+)\b/g, obfuscateNumber)
      .replace(functionCallRegex, obfuscateFunctionCall);
  });

  script = processedLines.join("\n");

  // Restore function declarations from placeholders
  script = script.replace(/\/\*FUNCTION_PLACEHOLDER_(\d+)\*\//g, (_, index) => {
    return functionHeaders[index];
  });

  return script;
}

function deobfuscateGS2(script) {
  // Decode base64-encoded strings
  const decodeBase64 = (str) => {
    try {
      return base64Decode(str);
    } catch (error) {
      return str;
    }
  };

  // Clean up encoded property access (e.g., @"encoded")
  const cleanProperty = (property) => {
    return property.replace(/\(@"([^"]+)"\)/g, (_, encoded) => {
      const decoded = decodeBase64(encoded);
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(decoded)) {
        return decoded;
      }
      return `(@"${encoded}")`;
    });
  };

  // Main script processing
  const processScript = (input) => {
    // Decode base64 strings inside base64decode()
    input = input.replace(/base64decode\((["'])(.*?)\1\)/gi, (_, __, inner) => `"${decodeBase64(inner)}"`);

    // Convert base64-decoded float values to numbers
    input = input.replace(/@float\((["']?)base64decode\((["'])(.*?)\2\)\1\)/gi, (_, __, ___, inner) => {
      return parseFloat(decodeBase64(inner).replace(/["']/g, ""));
    });

    // Convert @float() and float() to numbers, ensuring they have a decimal if missing
    input = input.replace(/@float\((["'])(.*?)\1\)/g, (_, __, inner) => {
      let num = parseFloat(inner);
      // Check if the number has no decimal part (it's an integer)
      if (!inner.includes('.')) {
        return num.toFixed(1); // Add .0 if no decimal is present
      }
      return num; // Return the number as-is if it already has a decimal
    });

    input = input.replace(/float\((["'])(.*?)\1\)/g, (_, __, inner) => {
      let num = parseFloat(inner);
      // Check if the number has no decimal part (it's an integer)
      if (!inner.includes('.')) {
        return num.toFixed(1); // Add .0 if no decimal is present
      }
      return num; // Return the number as-is if it already has a decimal
    });

    // Convert @int() and int() to numbers
    input = input.replace(/@int\((["'])(.*?)\1\)/g, (_, __, inner) => {
      let num = parseInt(inner); // Use parseInt to ensure it's treated as an integer
      return num;
    });

    input = input.replace(/int\((["'])(.*?)\1\)/g, (_, __, inner) => {
      let num = parseInt(inner); // Use parseInt to ensure it's treated as an integer
      return "(" + num + ")";
    });

    // Decode @"string" to base64 decoded values
    input = input.replace(/\(@"([^"]+)"\)/g, (_, encoded) => decodeBase64(encoded));

    // Clean up properties and expressions
    let previous;
    do {
      previous = input;
      input = input.replace(/(\w+)((\.|\["|"|\[@|\(@).+?)(?=[;\s=])/g, (match, prefix, properties) => {
        const cleanedProperties = cleanProperty(properties);
        return `${prefix}${cleanedProperties}`;
      });
    } while (previous !== input);

    // Simplify numeric expressions
    input = input.replace(/\((\d+)\)/g, "$1");

    return input;
  };

  return processScript(script);
}
