CREATE TABLE `historicoImportacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int,
	`usuarioId` int NOT NULL,
	`tipo` enum('devedores','dividas','baixa_lote','cnab_remessa','cnab_retorno') NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`urlArquivo` text,
	`totalRegistros` int NOT NULL DEFAULT 0,
	`registrosSucesso` int NOT NULL DEFAULT 0,
	`registrosErro` int NOT NULL DEFAULT 0,
	`detalhesErros` text,
	`status` enum('processando','concluido','erro') NOT NULL DEFAULT 'processando',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `historicoImportacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `remessasCNAB` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int NOT NULL,
	`usuarioId` int NOT NULL,
	`banco` varchar(50) NOT NULL DEFAULT 'BTG',
	`nomeArquivo` varchar(255) NOT NULL,
	`urlArquivo` text,
	`totalTitulos` int NOT NULL DEFAULT 0,
	`valorTotal` int NOT NULL DEFAULT 0,
	`nossoNumeroInicio` varchar(20),
	`nossoNumeroFim` varchar(20),
	`status` enum('gerado','enviado','processado') NOT NULL DEFAULT 'gerado',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `remessasCNAB_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `retornosCNAB` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int NOT NULL,
	`usuarioId` int NOT NULL,
	`remessaId` int,
	`banco` varchar(50) NOT NULL DEFAULT 'BTG',
	`nomeArquivo` varchar(255) NOT NULL,
	`urlArquivo` text,
	`totalTitulos` int NOT NULL DEFAULT 0,
	`titulosPagos` int NOT NULL DEFAULT 0,
	`titulosRejeitados` int NOT NULL DEFAULT 0,
	`valorTotalPago` int NOT NULL DEFAULT 0,
	`detalhes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retornosCNAB_id` PRIMARY KEY(`id`)
);
