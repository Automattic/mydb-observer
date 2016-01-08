
TESTS = test/*.js
REPORTER = spec

test:
	@./node_modules/.bin/mocha \
		--reporter $(REPORTER) \
		--bail \
		--slow 1000 \
		$(TESTS)

.PHONY: test
