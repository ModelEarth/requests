// Single input row: user selects provider and enters API key, then clicks Add.
// The key is saved to aPro and shown in the YAML box below; the input row clears for the next key.

(function initAgentsModule() {
		const AGENTS_SHELL_HTML = [
			'<div id="agentsFormRows"></div>',
			'<button id="addApi" class="button button-green" style="display:none;">Save</button>',
			'<button id="copyBtn" class="button" style="display: none;">Copy</button>',
			'<button id="viewBtn" class="button" style="display: none;">View</button>',
			'<button id="clearAll" class="button">Clear All</button>',
			'<button id="undoBtn" class="button button-undo" style="display: none;">Undo</button>',
			'<div style="clear:both; height:20px"></div>',
			'<textarea id="aProOutputYaml" style="display:none"></textarea>',
			'<div style="clear:both; height:16px"></div>',
			'Copy to transfer your keys to another browser. <a href="agents" target="edit-agents">→</a>'
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

	const PROVIDER_LABELS = {
		'CLAUDE_API_KEY':     'Claude',
		'GEMINI_API_KEY':     'Gemini',
		'OPENAI_API_KEY':     'OpenAI',
		'XAI_API_KEY':        'xAI',
		'GROQ_API_KEY':       'Groq',
		'TOGETHER_API_KEY':   'Together AI',
		'FIREWORKS_API_KEY':  'Fireworks AI',
		'MISTRAL_API_KEY':    'Mistral',
		'PERPLEXITY_API_KEY': 'Perplexity',
		'DEEPSEEK_API_KEY':   'DeepSeek',
	};

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

	function generateProviderOptionsHtml(aProRef) {
		const options = ['<option value="">Select a provider...</option>'];
		apiProviders.forEach(function(provider) {
			const hasKey = aProRef && aProRef[provider];
			const label = (PROVIDER_LABELS[provider] || provider) + (hasKey ? ' ●' : '');
			options.push('<option value="' + provider + '">' + label + '</option>');
		});
		options.push('<option value="Other">Other</option>');
		return options.join('');
	}

	function generateRepeatingSection(index, aProRef) {
		return [
			'<div class="repeating-section" style="display:inline-text" id="panel' + index + '">',
			'  <div style="display:flex; align-items:center; gap:8px;">',
			'    <select id="apiProvider' + index + '" class="apiProvider">',
			generateProviderOptionsHtml(aProRef),
			'    </select>',
			'    <button class="ae-close-agents" title="Close" style="margin-left:auto; background:none; border:1px solid #aaa; border-radius:50%; width:22px; height:22px; cursor:pointer; color:#888; font-size:0.85rem; line-height:1; padding:0; display:flex; align-items:center; justify-content:center;">&#x2715;</button>',
			'  </div>',
			'  <input type="text" id="apiProviderOther' + index + '" placeholder="Other Provider" class="textInput" style="display:none; min-width:225px; margin-bottom:10px">',
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
			
	if (typeof window.jsyaml !== 'undefined') {
						const yamlString = window.jsyaml.dump(aPro);
					if (JSON.stringify(aPro) === '{}' || typeof JSON.stringify(aPro) === 'undefined') {
						$('#aProOutputYaml').val('').hide();
						$('#copyBtn').hide();
						$('#viewBtn').hide();
						resetCopyButtonLabel();
					} else {
						$('#aProOutputYaml').val(yamlString);
						$('#copyBtn').show();
						$('#viewBtn').show();
						resetCopyButtonLabel();
					}
				}
			applyYamlVisibility();
			resizeYamlOutput();
		}

		function ensureSingleInputRow() {
			$('#agentsFormRows').empty();
			$('#agentsFormRows').append(generateRepeatingSection(1, aPro));
		}

		function updateSaveBtn() {
			const provider = $('#apiProvider1').val();
			const key = $('#apiKey1').val().trim();
			$('#addApi').toggle(!!(provider && key));
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

		checkUndoAvailability();
		ensureSingleInputRow();
		updateLocalStorage();

		// Restore previously selected provider (don't show key field — no pre-filled value)
		(function() {
			const saved = localStorage.getItem('ae_provider1');
			if (!saved) return;
			$('#apiProvider1').val(saved);
			if (saved === 'Other') $('#apiProviderOther1').show();
		}());

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
			ensureSingleInputRow();
			updateSaveBtn();
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
			if (index === '1') {
				localStorage.setItem('ae_provider1', newKey);
			}
			updateSaveBtn();
		});

		$host.on('input', '#apiKey1', function() {
			updateSaveBtn();
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

		$host.on('click', '#viewBtn', function() {
			const yaml = $('#aProOutputYaml');
			const visible = yaml.is(':visible');
			yaml.toggle(!visible);
			$(this).text(visible ? 'View' : 'Hide');
		});

		$host.on('click', '.ae-close-agents', function() {
			$('#agentsContainer').hide();
			$('#toggleAgentsEditor').show();
		});

		$host.on('click', '#clearAll', function() {
			saveUndoState();
			localStorage.removeItem('aPro');
			localStorage.removeItem('ae_provider1');
			aPro = {};
			updateLocalStorage();
			ensureSingleInputRow();
			updateSaveBtn();
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
