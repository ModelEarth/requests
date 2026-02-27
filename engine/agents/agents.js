// Single input row: user selects provider and enters API key, then clicks Add.
// The key is saved to aPro and shown in the YAML box below; the input row clears for the next key.

(function initAgentsModule() {
		const AGENTS_SHELL_HTML = [
			'Keys reside in local browser storage.<br><br>',
			'<div id="agentsFormRows"></div>',
			'<button id="addApi" class="button button-green">Add</button>',
			'<button id="copyBtn" class="button" style="display: none;">Copy</button>',
			'<button id="clearAll" class="button">Clear All</button>',
			'<button id="undoBtn" class="button button-undo" style="display: none;">Undo</button>',
			'<div style="clear:both; height:20px"></div>',
			'<textarea id="aProOutput" style="display:none"></textarea>',
			'<textarea id="aProOutputYaml"></textarea>',
			'<textarea id="aProInput" style="display: none;"></textarea>',
			'<div style="clear:both; height:4px"></div>',
			'<button id="closeBtn" class="button" style="display: none;">Close</button>',
			'<div style="clear:both; height:16px"></div>',
			'Copy to transfer your keys to another browser.'
		].join('');

	const apiProviders = [
		'CLAUDE_API_KEY',
		'GEMINI_API_KEY',
		'OPENAI_API_KEY',
		'XAI_API_KEY',
		'GROQ_API_KEY',
		'TOGETHER_API_KEY',
		'FIREWORKS_API_KEY',
		'MISTRAL_API_KEY',
		'PERPLEXITY_API_KEY',
		'DEEPSEEK_API_KEY'
	];

	function ensureAgentsContainer() {
		const host = document.getElementById('agentsContainer');
		if (!host) {
			return null;
		}
		if (!host.dataset.agentsShellReady) {
			host.innerHTML = AGENTS_SHELL_HTML;
			host.dataset.agentsShellReady = 'true';
		}
		return host;
	}

	function generateProviderOptionsHtml() {
		const options = ['<option value="">Select a provider...</option>'];
		apiProviders.forEach(function(provider) {
			options.push('<option>' + provider + '</option>');
		});
		options.push('<option>Other</option>');
		return options.join('');
	}

	function generateRepeatingSection(index) {
		return [
			'<div class="repeating-section" style="display:inline-text" id="panel' + index + '">',
			'  <div style="float: left;">',
			'    <label for="apiProvider' + index + '">API Provider</label><br>',
			'    <select id="apiProvider' + index + '" class="apiProvider">',
			generateProviderOptionsHtml(),
			'    </select><br>',
			'    <input type="text" id="apiProviderOther' + index + '" placeholder="Other Provider" class="textInput" style="display:none; min-width:225px; margin-bottom:10px">',
			'  </div>',
			'  <div id="apiKeyField' + index + '" style="display:none; overflow:auto; min-width:300px">',
			'    <label for="apiKey' + index + '">API Key</label><br>',
			'    <div class="api-key-container">',
			'      <input type="text" autocomplete="off" class="textInput hiddenInput" id="apiKey' + index + '" style="min-width:200px;width:100%; margin-bottom:10px;border-radius:8px; padding-right: 40px;">',
			'      <button onclick="toggleVisibility(\'apiKey' + index + '\')" class="eye-toggle-btn" type="button">',
			'        <svg xmlns="http://www.w3.org/2000/svg" class="eye-icon" viewBox="0 0 20 20" fill="currentColor">',
			'          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />',
			'          <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />',
			'        </svg>',
			'      </button>',
			'    </div>',
			'  </div>',
			'</div>'
		].join('');
	}

	function initAgentsEditor() {
		if (typeof window.jQuery === 'undefined') {
			return;
		}

		const host = ensureAgentsContainer();
		if (!host) {
			return;
		}

		const $ = window.jQuery;
		const $host = $('#agentsContainer');
		if ($host.data('agentsBound')) {
			return;
		}
		$host.data('agentsBound', true);

		let aPro = {};
		let undoTimer = null;
		let suppressYamlReveal = false;
		let copyStatusTimer = null;
		const UNDO_EXPIRY_MS = 5 * 60 * 1000;

		function isValidJSON(str) {
			try {
				JSON.parse(str);
				return true;
			} catch (e) {
				return false;
			}
		}

		if (isValidJSON(localStorage.getItem('aPro'))) {
			aPro = JSON.parse(localStorage.getItem('aPro')) || {};
		}

		function buildOrderedAPro() {
			const orderedObj = {};
			Object.keys(aPro).forEach(function(k) {
				orderedObj[k] = aPro[k];
			});
			return orderedObj;
		}

		function getYamlTextarea() {
			return document.getElementById('aProOutputYaml');
		}

		function setYamlBlurred(blurred) {
			const yamlField = getYamlTextarea();
			if (!yamlField) {
				return;
			}
			yamlField.classList.toggle('yaml-blurred', blurred);
		}

		function applyYamlVisibility() {
			const yamlField = getYamlTextarea();
			if (!yamlField) {
				return;
			}
			setYamlBlurred(document.activeElement !== yamlField);
		}

		function resizeYamlOutput() {
			const yamlField = getYamlTextarea();
			if (!yamlField) {
				return;
			}
			yamlField.rows = 1;
			yamlField.style.height = 'auto';
			const style = window.getComputedStyle(yamlField);
			const lineHeight = parseFloat(style.lineHeight) || 24;
			const minHeight = Math.ceil(
				lineHeight +
				(parseFloat(style.paddingTop) || 0) +
				(parseFloat(style.paddingBottom) || 0) +
				(parseFloat(style.borderTopWidth) || 0) +
				(parseFloat(style.borderBottomWidth) || 0)
			);
			yamlField.style.height = Math.max(minHeight, yamlField.scrollHeight) + 'px';
		}

		function resetCopyButtonLabel() {
			const copyBtn = document.getElementById('copyBtn');
			if (!copyBtn) {
				return;
			}
			copyBtn.textContent = 'Copy';
			copyBtn.title = '';
		}

		function showCopyStatus() {
			const copyBtn = document.getElementById('copyBtn');
			if (!copyBtn) {
				return;
			}
			copyBtn.textContent = 'COPIED';
			copyBtn.title = 'COPIED';
			if (copyStatusTimer) {
				clearTimeout(copyStatusTimer);
			}
			copyStatusTimer = setTimeout(function() {
				resetCopyButtonLabel();
			}, 2000);
		}

		function clearUndoSnapshot() {
			localStorage.removeItem('localStoragePrior');
			$('#undoBtn').hide();
			if (undoTimer) {
				clearTimeout(undoTimer);
				undoTimer = null;
			}
		}

		function updateLocalStorage() {
			localStorage.setItem('aPro', JSON.stringify(aPro));
			$('#aProOutput').val(JSON.stringify(aPro, null, 2));

				if (typeof window.jsyaml !== 'undefined') {
					const orderedAPro = buildOrderedAPro();
					const yamlString = window.jsyaml.dump(orderedAPro);
					if (JSON.stringify(aPro) === '{}' || typeof JSON.stringify(aPro) === 'undefined') {
						$('#aProOutputYaml').val('');
						$('#copyBtn').hide();
						resetCopyButtonLabel();
					} else {
						$('#aProOutputYaml').val(yamlString);
						$('#copyBtn').show();
						resetCopyButtonLabel();
					}
				}
			applyYamlVisibility();
			resizeYamlOutput();
		}

		function ensureSingleInputRow() {
			$('#agentsFormRows').empty();
			$('#agentsFormRows').append(generateRepeatingSection(1));
		}

		function clearInputRow() {
			$('#apiProvider1').val('');
			$('#apiKey1').val('');
			$('#apiProviderOther1').val('').hide();
			$('#apiKeyField1').hide();
			const keyInput = document.getElementById('apiKey1');
			if (keyInput && keyInput.className.indexOf('hiddenInput') === -1) {
				keyInput.className = 'textInput hiddenInput';
			}
		}

		function populateRepeatingSections() {
			ensureSingleInputRow();
			updateLocalStorage();
		}

		function generateUniqueKey(baseKey) {
			if (!Object.prototype.hasOwnProperty.call(aPro, baseKey)) {
				return baseKey;
			}

			let counter = 2;
			let numberedKey = baseKey + ' (' + counter + ')';
			while (Object.prototype.hasOwnProperty.call(aPro, numberedKey)) {
				counter++;
				numberedKey = baseKey + ' (' + counter + ')';
			}
			return numberedKey;
		}

		function saveUndoState() {
			const undoData = {
				aPro: JSON.stringify(aPro),
				yamlString: $('#aProOutputYaml').val(),
				timestamp: Date.now()
			};
			localStorage.setItem('localStoragePrior', JSON.stringify(undoData));

			if (undoTimer) {
				clearTimeout(undoTimer);
			}

			$('#undoBtn').show();
			undoTimer = setTimeout(function() {
				clearUndoSnapshot();
			}, UNDO_EXPIRY_MS);
		}

		function checkUndoAvailability() {
			const undoData = localStorage.getItem('localStoragePrior');
			if (!undoData) {
				return;
			}
			try {
				const parsed = JSON.parse(undoData);
				const timeDiff = Date.now() - parsed.timestamp;
				if (timeDiff < UNDO_EXPIRY_MS) {
					$('#undoBtn').show();
					const remainingTime = UNDO_EXPIRY_MS - timeDiff;
					undoTimer = setTimeout(function() {
						clearUndoSnapshot();
					}, remainingTime);
				} else {
					clearUndoSnapshot();
				}
			} catch (e) {
				clearUndoSnapshot();
			}
		}

		function hasDuplicateKeys(yamlString) {
			const lines = yamlString.split('\n');
			const seenKeys = {};
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line && line[0] !== '#') {
					const keyValue = line.split(':');
					const key = keyValue[0].trim();
					if (seenKeys[key]) {
						return true;
					}
					seenKeys[key] = true;
				}
			}
			return false;
		}

		function updateKeyStorage() {
			if (hasDuplicateKeys($('#aProOutputYaml').val())) {
				alert('Duplicate provides. Please add (2) after second instance.');
				return;
			}
			if (typeof window.jsyaml === 'undefined') {
				alert('YAML parser not loaded yet.');
				return;
			}
			aPro = window.jsyaml.load($('#aProOutputYaml').val()) || {};
			updateLocalStorage();
			ensureSingleInputRow();
		}

		clearUndoSnapshot();
		ensureSingleInputRow();
		updateLocalStorage();

		$host.on('click', '#addApi', function() {
			let provider = $('#apiProvider1').val();
			if (provider === 'Other') {
				provider = $('#apiProviderOther1').val().trim();
			}
			const keyVal = $('#apiKey1').val().trim();
			if (!provider || !keyVal) {
				return;
			}
			provider = provider.replace(/\s*\(\d+\)$/, '');
			saveUndoState();
			const finalKey = generateUniqueKey(provider);
			aPro[finalKey] = keyVal;
			updateLocalStorage();
			clearInputRow();
		});

		$host.on('change', 'select[id^="apiProvider"]', function() {
			const indexMatch = this.id.match(/\d+/);
			if (!indexMatch) {
				return;
			}
			const index = indexMatch[0];
			const newKey = $(this).val();
			if (newKey === 'Other') {
				$('#apiProviderOther' + index).show();
			} else {
				$('#apiProviderOther' + index).hide();
			}
			if (newKey) {
				$('#apiKeyField' + index).show();
			} else {
				$('#apiKeyField' + index).hide();
				$('#apiKey' + index).val('').attr('class', 'textInput hiddenInput');
			}
		});

		$host.on('click', '#undoBtn', function() {
			const undoData = localStorage.getItem('localStoragePrior');
			if (!undoData) {
				return;
			}
			try {
				const parsed = JSON.parse(undoData);
				if ((Date.now() - parsed.timestamp) > UNDO_EXPIRY_MS) {
					clearUndoSnapshot();
					return;
				}
				aPro = JSON.parse(parsed.aPro);
				updateLocalStorage();
				ensureSingleInputRow();
				clearUndoSnapshot();
			} catch (e) {
				console.error('Error restoring undo state:', e);
			}
		});

		$host.on('input', '#aProOutputYaml', function() {
			setYamlBlurred(false);
			resizeYamlOutput();
		});

		$host.on('keydown', '#aProOutputYaml', function(event) {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				saveUndoState();
				updateKeyStorage();
			}
		});

		$host.on('click focus', '#aProOutputYaml', function() {
			if (suppressYamlReveal) {
				return;
			}
			setYamlBlurred(false);
		});

		$host.on('blur', '#aProOutputYaml', function() {
			setYamlBlurred(true);
		});

		$host.on('click', '#copyBtn', function() {
			const yamlField = document.getElementById('aProOutputYaml');
			if (!yamlField) {
				return;
			}
			const wasBlurred = yamlField.classList.contains('yaml-blurred');
			const activeEl = document.activeElement;

			function fallbackCopy() {
				suppressYamlReveal = true;
				yamlField.focus();
				yamlField.select();
				const copied = document.execCommand('copy');
				if (activeEl && typeof activeEl.focus === 'function') {
					activeEl.focus();
				}
				suppressYamlReveal = false;
				setYamlBlurred(wasBlurred);
				if (copied) {
					showCopyStatus();
				}
			}

			if (navigator.clipboard && window.isSecureContext) {
				navigator.clipboard.writeText(yamlField.value).then(function() {
					setYamlBlurred(wasBlurred);
					showCopyStatus();
				}).catch(function() {
					fallbackCopy();
				});
				return;
			}

			fallbackCopy();
		});

		$host.on('click', '#closeBtn', function() {
			$('#aProOutput').hide();
			$(this).hide();
		});

		$host.on('click', '#pasteBtn', function() {
			$('#aProInput').show();
			$('#aProInput').val('').focus();
		});

		$host.on('input', '#aProInput', function() {
			const input = $(this).val().trim();
			if (!input) {
				return;
			}
			try {
				const parsed = JSON.parse(input);
				for (const key in parsed) {
					if (!Object.prototype.hasOwnProperty.call(parsed, key)) {
						continue;
					}
					const originalKey = key.replace(/\d+/g, '').replace(/_/g, ' ');
					const existingKeys = Object.keys(aPro).map(function(k) {
						return k.replace(/\d+/g, '').replace(/_/g, ' ');
					});
					if (!existingKeys.includes(originalKey)) {
						aPro[key] = parsed[key];
					} else {
						let counter = 2;
						while (existingKeys.includes(originalKey + counter)) {
							counter++;
						}
						aPro[originalKey.replace(/ /g, '_') + counter] = parsed[key];
					}
				}
				updateLocalStorage();
				populateRepeatingSections();
			} catch (error) {
				console.error('Error parsing input:', error);
			}
		});

		$host.on('click', '#clearAll', function() {
			saveUndoState();
			localStorage.removeItem('aPro');
			aPro = {};
			updateLocalStorage();
			ensureSingleInputRow();
			clearInputRow();
		});
	}

	window.initAgentsEditor = initAgentsEditor;

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initAgentsEditor);
	} else {
		initAgentsEditor();
	}
})();

// Toggle visibility function for API key fields
function toggleVisibility(fieldId) {
	const input = document.getElementById(fieldId);
	if (!input) {
		return;
	}
	if (input.className === 'textInput') {
		input.className = 'textInput hiddenInput';
	} else {
		input.className = 'textInput';
	}
}
